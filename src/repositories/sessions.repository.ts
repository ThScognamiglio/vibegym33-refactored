/**
 * sessions.repository.ts
 *
 * RESPONSABILITÀ: CRUD sulle sessioni di allenamento completate (WorkoutSession)
 * e operazioni di pulizia/deduplicazione dei log di sessione.
 *
 * DIPENDENZE CONSENTITE: firebase.config.ts, firebase/firestore, types.ts
 * NON importare da: components/, services/firebase.ts (legacy), core/, hooks/.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  setDoc,
  addDoc,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../services/firebase.config';
import { WorkoutSession, Log } from '../types';

import { z } from 'zod';
import { validatePayload, UserSchema, ExerciseSchema, BodyMeasurementSchema, WorkoutSchema, WorkoutItemSchema, LogSchema, WorkoutSessionSchema, HistorySnapshotSchema, HistorySnapshotPreviewSchema } from '../schemas';
import { invalidateLogsCache } from './logs.repository';

// ─── HELPER ───────────────────────────────────────────────────────────────────
const toDoc = <T>(snap: any, schema: z.ZodType<T>): T => {
  const data = snap.data() || {};
  Object.keys(data).forEach(key => {
    if (data[key] instanceof Timestamp) data[key] = data[key].toDate().toISOString();
  });
  const raw = { id: snap.id, uid: snap.id, ...data };
  return validatePayload(schema, raw);
};

// ─── IN-MEMORY CACHE (sessions) ───────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;
interface SessionsCache { userId: string; data: WorkoutSession[]; fetchedAt: number; }
let _sessionsCache: SessionsCache | null = null;

const isCacheValid = (userId: string): boolean =>
  !!_sessionsCache &&
  _sessionsCache.userId === userId &&
  (Date.now() - _sessionsCache.fetchedAt) < CACHE_TTL_MS;

export const invalidateSessionsCache = () => { _sessionsCache = null; };

// ─── SESSIONS REPOSITORY ─────────────────────────────────────────────────────

export const SessionsRepository = {

  /**
   * Salva o aggiorna un riassunto di sessione.
   * Se viene passato un `id`, usa setDoc con merge: true (upsert).
   * Altrimenti crea un nuovo documento.
   */
  saveSessionSummary: async (
    session: Omit<WorkoutSession, 'id'> & { id?: string }
  ): Promise<string> => {
    if (!db) throw new Error('[SessionsRepository] Firestore non inizializzato.');
    const { id, ...sessionData } = session;
    if (id) {
      const ref = doc(db, `users/${session.userId}/sessions`, id);
      await setDoc(ref, { ...sessionData, timestamp: serverTimestamp() }, { merge: true });
      invalidateSessionsCache();
      return id;
    } else {
      const ref = await addDoc(
        collection(db, `users/${session.userId}/sessions`),
        { ...sessionData, timestamp: serverTimestamp() }
      );
      invalidateSessionsCache();
      return ref.id;
    }
  },

  /** Sessioni di oggi per un determinato piano (potenzialmente multiple per deduplication). */
  getTodaySessions: async (userId: string, workoutId: string): Promise<WorkoutSession[]> => {
    if (!db) throw new Error('[SessionsRepository] Firestore non inizializzato.');
    const today    = new Date().toISOString().split('T')[0];
    const tomorrowOffset = new Date();
    tomorrowOffset.setDate(tomorrowOffset.getDate() + 1);
    const tomorrow = tomorrowOffset.toISOString().split('T')[0];
    const snap = await getDocs(query(
      collection(db, `users/${userId}/sessions`),
      where('date', '>=', today),
      where('date', '<', tomorrow)
    ));
    return snap.docs
      .map(d => toDoc(d, WorkoutSessionSchema))
      .filter(s => s.workoutId === workoutId)
      .reverse(); // più recente prima
  },

  /**
   * Tutte le sessioni di un utente, ordinate per data decrescente.
   * Cache in-memory con TTL 5 minuti.
   */
  getAllSessionsForClient: async (userId: string): Promise<WorkoutSession[]> => {
    if (!db) throw new Error('[SessionsRepository] Firestore non inizializzato.');
    if (isCacheValid(userId)) {
      console.log('[SessionsRepository] 📦 Cache hit: sessions');
      return _sessionsCache!.data;
    }
    const snap = await getDocs(query(
      collection(db, `users/${userId}/sessions`),
      orderBy('date', 'desc')
    ));
    const data = snap.docs.map(d => toDoc(d, WorkoutSessionSchema));
    _sessionsCache = { userId, data, fetchedAt: Date.now() };
    return data;
  },

  /**
   * Cleanup one-shot: elimina log skippati (completed=false) di oggi e
   * de-duplica i log reali con lo stesso (exerciseId, seriesNo) mantenendo
   * quello con peso maggiore. Aggiorna la sessione Firestore con i totali puliti.
   *
   * IDEMPOTENTE: può essere chiamato N volte senza effetti collaterali.
   * CASO D'USO: sanare sessioni di test o bug di double-submit.
   */
  cleanupTodaySession: async (
    userId: string,
    workoutId: string
  ): Promise<{ deletedLogs: number; cleanSets: number; cleanVolume: number }> => {
    if (!db) throw new Error('[SessionsRepository] Firestore non inizializzato.');
    const today    = new Date().toISOString().split('T')[0];
    const tomorrowOffset = new Date();
    tomorrowOffset.setDate(tomorrowOffset.getDate() + 1);
    const tomorrow = tomorrowOffset.toISOString().split('T')[0];

    // 1. Fetch tutti i log di oggi per questo piano
    const logsSnap = await getDocs(query(
      collection(db, `users/${userId}/logs`),
      where('date', '>=', today),
      where('date', '<', tomorrow)
    ));
    const allToday = logsSnap.docs
      .map(d => ({ ref: d.ref, data: toDoc(d, LogSchema) }))
      .filter(({ data }) => data.workoutId === workoutId);

    // 2. Separa skip da log reali
    const skipLogs = allToday.filter(({ data }) => data.completed === false);
    const realLogs = allToday.filter(({ data }) => data.completed !== false);

    // 3. De-duplica: per (exerciseId, seriesNo) mantieni il peso maggiore
    const seen = new Map<string, typeof realLogs[0]>();
    const toDelete: typeof realLogs = [];
    realLogs.forEach(entry => {
      const key = `${entry.data.exerciseId}_${entry.data.seriesNo}`;
      if (!seen.has(key)) {
        seen.set(key, entry);
      } else {
        const existing = seen.get(key)!;
        if (entry.data.weight > existing.data.weight) {
          toDelete.push(existing);
          seen.set(key, entry);
        } else {
          toDelete.push(entry);
        }
      }
    });

    // 4. Elimina skip + duplicati
    await Promise.all([...skipLogs, ...toDelete].map(({ ref }) => deleteDoc(ref)));

    // 5. Calcola totali dal set pulito (in-memory)
    const workoutRef = doc(db, 'workouts', workoutId);
    const workoutSnap = await getDoc(workoutRef);
    const workoutData = workoutSnap.exists() ? workoutSnap.data() : null;
    const ptId = workoutData?.ptId || userId;

    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.exists() ? userSnap.data() : null;
    const defaultUserWeight = userData?.weight || 70; // Fallback generico

    const exercisesRef = collection(db, `users/${ptId}/exercises`);
    const exercisesSnap = await getDocs(exercisesRef);
    const exercisesMap: Record<string, any> = {};
    exercisesSnap.forEach(d => exercisesMap[d.id] = d.data());

    const { Log: DomainLog, resolveBodyweight, Equipment, normalizeEquipment } = await import('../core/domain');

    const cleanLogs = Array.from(seen.values()).map(e => e.data);
    const cleanVolume = cleanLogs.reduce((acc, l) => {
        const ex = exercisesMap[l.exerciseId];
        const isBw = ex ? (normalizeEquipment(ex.equipment) === Equipment.BODYWEIGHT) : false;
        const isUni = ex ? !!ex.isUnilateral : false;
        const logBw = resolveBodyweight(l.bodyweightAtLog, defaultUserWeight);
        const dLog = new DomainLog(l);
        return acc + dLog.calculateVolume({ isBodyweight: isBw, isUnilateral: isUni }, logBw);
    }, 0);
    const cleanSets = cleanLogs.length;

    // 6. Re-indicizza seriesNo per esercizio
    const byExercise: Record<string, Log[]> = {};
    cleanLogs.forEach(l => {
      if (!byExercise[l.exerciseId]) byExercise[l.exerciseId] = [];
      byExercise[l.exerciseId].push(l);
    });
    const reindexOps: Promise<void>[] = [];
    Object.values(byExercise).forEach(exLogs => {
      exLogs.sort((a, b) => a.seriesNo - b.seriesNo);
      exLogs.forEach((log, i) => {
        if (log.seriesNo !== i + 1) {
          reindexOps.push(
            updateDoc(doc(db!, `users/${userId}/logs/${log.id}`), { seriesNo: i + 1 })
          );
        }
      });
    });
    await Promise.all(reindexOps);

    // 7. Aggiorna la sessione Firestore con i totali corretti
    const sessSnap = await getDocs(query(
      collection(db, `users/${userId}/sessions`),
      where('date', '>=', today),
      where('date', '<', tomorrow)
    ));
    const todaySessions = sessSnap.docs
      .filter(d => d.data().workoutId === workoutId)
      .sort((a, b) => (b.data().timestamp?.seconds || 0) - (a.data().timestamp?.seconds || 0));

    if (todaySessions.length > 0) {
      const [latest, ...old] = todaySessions;
      await Promise.all(old.map(d => deleteDoc(d.ref)));
      await setDoc(latest.ref, { volume: cleanVolume, sets: cleanSets }, { merge: true });
    }

    invalidateLogsCache();
    return { deletedLogs: skipLogs.length + toDelete.length, cleanSets, cleanVolume };
  },
};
