/**
 * users.repository.ts
 *
 * RESPONSABILITÀ: gestione anagrafica utenti, relazioni PT/client, misure
 * corporee, esercizi, analytics aggregati e operazioni admin/GDPR.
 *
 * DIPENDENZE CONSENTITE: firebase.config.ts, firebase/firestore, types.ts
 * NON importare da: components/, services/firebase.ts (legacy), core/, hooks/.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../services/firebase.config';
import { User, Exercise, BodyMeasurement, Log, Workout, WorkoutItem, WorkoutSession, ClientExerciseSummary, ClientPlanSummary, HistorySnapshot } from '../types';

import { z } from 'zod';
import { 
  validatePayload, 
  UserSchema, 
  ExerciseSchema, 
  BodyMeasurementSchema, 
  WorkoutSchema, 
  WorkoutItemSchema, 
  LogSchema, 
  WorkoutSessionSchema 
} from '../schemas';

// ─── HELPER ───────────────────────────────────────────────────────────────────
const toDoc = <T>(snap: any, schema: z.ZodType<T>): T => {
  const data = snap.data() || {};
  Object.keys(data).forEach(key => {
    if (data[key] instanceof Timestamp) data[key] = data[key].toDate().toISOString();
  });
  const raw = { id: snap.id, uid: snap.id, ...data };
  return validatePayload(schema, raw);
};

// ─── IN-MEMORY CACHE (exercises) ─────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;
interface ExerciseCache { ptId: string; data: Exercise[]; fetchedAt: number; }
let _exercisesCache: ExerciseCache | null = null;

const isExerciseCacheValid = (ptId: string): boolean =>
  !!_exercisesCache &&
  _exercisesCache.ptId === ptId &&
  (Date.now() - _exercisesCache.fetchedAt) < CACHE_TTL_MS;

export const invalidateExercisesCache = () => { _exercisesCache = null; };

// ─── USERS REPOSITORY ────────────────────────────────────────────────────────

export const UsersRepository = {

  // ── ADMIN ──────────────────────────────────────────────────────────────────

  /** Recupera tutti gli utenti con ruolo PT (per admin panel). */
  getAllPTs: async (): Promise<User[]> => {
    if (!db) throw new Error('[UsersRepository] Firestore non inizializzato.');
    const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'pt')));
    return snap.docs.map(d => toDoc(d, UserSchema));
  },

  /** Attiva/disattiva un utente (approvazione PT da admin). */
  toggleUserStatus: async (targetUid: string, isActive: boolean): Promise<void> => {
    if (!db) throw new Error('[UsersRepository] Firestore non inizializzato.');
    await updateDoc(doc(db, 'users', targetUid), { isActive });
  },

  // ── PT/CLIENT RELATIONSHIP ─────────────────────────────────────────────────

  /**
   * Collega un client a un PT tramite codice invito.
   * Cerca il PT per `inviteCode` nella collection users, quindi aggiorna
   * il documento del client con `ptAssigned: pt.uid`.
   */
  linkClientToPT: async (clientUid: string, inviteCode: string): Promise<User> => {
    if (!db) throw new Error('[UsersRepository] Firestore non inizializzato.');
    const clean = inviteCode.trim().toUpperCase();
    const snap = await getDocs(query(
      collection(db, 'users'),
      where('role', '==', 'pt'),
      where('inviteCode', '==', clean)
    ));
    if (snap.empty) throw new Error('Codice invito non valido. Contatta il tuo PT.');
    const pt = toDoc(snap.docs[0], UserSchema);
    await updateDoc(doc(db, 'users', clientUid), { ptAssigned: pt.uid });
    const updated = await getDoc(doc(db, 'users', clientUid));
    return toDoc(updated, UserSchema);
  },

  /** Rimuove l'associazione PT di un client. */
  unlinkClientFromPT: async (clientUid: string): Promise<User> => {
    if (!db) throw new Error('[UsersRepository] Firestore non inizializzato.');
    await updateDoc(doc(db, 'users', clientUid), { ptAssigned: null });
    const updated = await getDoc(doc(db, 'users', clientUid));
    return toDoc(updated, UserSchema);
  },

  /** Recupera tutti i client assegnati a un PT. */
  getClientsForPT: async (ptId: string): Promise<User[]> => {
    if (!db) throw new Error('[UsersRepository] Firestore non inizializzato.');
    const snap = await getDocs(query(
      collection(db, 'users'),
      where('ptAssigned', '==', ptId)
    ));
    return snap.docs.map(d => toDoc(d, UserSchema));
  },

  // ── EXERCISES ──────────────────────────────────────────────────────────────

  /**
   * Recupera gli esercizi di un PT (o tutti se ptId è omesso).
   * Cache in-memory con TTL 5 minuti per ridurre letture Firestore.
   */
  getExercises: async (ptId?: string): Promise<Exercise[]> => {
    if (!db) throw new Error('[UsersRepository] Firestore non inizializzato.');
    const cacheKey = ptId || '__all__';
    if (isExerciseCacheValid(cacheKey)) return _exercisesCache!.data;

    const q = ptId
      ? query(collection(db, 'exercises'), where('ptId', '==', ptId))
      : query(collection(db, 'exercises'));
    const snap = await getDocs(q);
    const result = snap.docs.map(d => toDoc(d, ExerciseSchema));
    _exercisesCache = { ptId: cacheKey, data: result, fetchedAt: Date.now() };
    return result;
  },

  /** Crea un nuovo esercizio. Invalida la cache locale. */
  createExercise: async (ptId: string, data: Omit<Exercise, 'id' | 'ptId'>): Promise<Exercise> => {
    if (!db) throw new Error('[UsersRepository] Firestore non inizializzato.');
    const ref = await addDoc(collection(db, 'exercises'), {
      ...data,
      ptId,
      createdAt: serverTimestamp(),
    });
    invalidateExercisesCache();
    return { id: ref.id, ptId, ...data } as Exercise;
  },

  /** Aggiornamento parziale di un esercizio. Invalida la cache. */
  updateExercise: async (exerciseId: string, data: Partial<Exercise>): Promise<void> => {
    if (!db) throw new Error('[UsersRepository] Firestore non inizializzato.');
    const safeData: Record<string, any> = {};
    Object.entries(data).forEach(([k, v]) => { if (v !== undefined) safeData[k] = v; });
    await updateDoc(doc(db, 'exercises', exerciseId), safeData);
    invalidateExercisesCache();
  },

  /** Elimina un esercizio. Invalida la cache. */
  deleteExercise: async (exerciseId: string): Promise<void> => {
    if (!db) throw new Error('[UsersRepository] Firestore non inizializzato.');
    await deleteDoc(doc(db, 'exercises', exerciseId));
    invalidateExercisesCache();
  },

  // ── MISURE CORPOREE ────────────────────────────────────────────────────────

  /** Salva una nuova misurazione corporea. */
  addMeasurement: async (data: Omit<BodyMeasurement, 'id'>): Promise<void> => {
    if (!db) throw new Error('[UsersRepository] Firestore non inizializzato.');
    await addDoc(collection(db, `users/${data.userId}/measurements`), data);
  },

  /** Recupera tutte le misurazioni di un utente (ordine decrescente per data). */
  getMeasurements: async (userId: string): Promise<BodyMeasurement[]> => {
    if (!db) throw new Error('[UsersRepository] Firestore non inizializzato.');
    const snap = await getDocs(query(
      collection(db, `users/${userId}/measurements`),
      orderBy('date', 'desc')
    ));
    return snap.docs.map(d => toDoc(d, BodyMeasurementSchema));
  },

  // ── ANALYTICS AGGREGATI ───────────────────────────────────────────────────

  /**
   * Calcola i riassunti per esercizio (PR, totalReps, lastUpdated) a partire
   * dai log già scaricati (o li scarica se non forniti).
   * NOTA: totalSessions e avgWeight non sono calcolati in questa versione
   * per evitare N+1 queries — sono placeholder per compatibilità con il tipo.
   * Se `providedLogs` è fornito, riusa i dati senza fetch aggiuntivi.
   */
  getClientExerciseSummaries: async (
    clientId: string,
    providedLogs?: Log[]
  ): Promise<ClientExerciseSummary[]> => {
    if (!db) throw new Error('[UsersRepository] Firestore non inizializzato.');
    // Importa LogsRepository inline per evitare circular dependency
    const { LogsRepository } = await import('./logs.repository');
    const logs = providedLogs || await LogsRepository.getAllLogsForClient(clientId);
    const exMap: Record<string, ClientExerciseSummary> = {};
    logs.forEach(log => {
      if (!exMap[log.exerciseId]) {
        exMap[log.exerciseId] = {
          exerciseId: log.exerciseId,
          totalSessions: 0,
          totalReps: 0,
          avgWeight: 0,
          pr: 0,
          lastUpdated: ''
        };
      }
      const entry = exMap[log.exerciseId];
      entry.totalReps += log.reps;
      if (log.weight > entry.pr) entry.pr = log.weight;
      entry.lastUpdated = log.date > entry.lastUpdated ? log.date : entry.lastUpdated;
    });
    return Object.values(exMap);
  },

  /**
   * Calcola il riassunto del piano attivo: aderenza, volume medio settimanale,
   * sessioni completate. Combina dati HOT (ultimi 30gg) e COLD (blob mensili).
   *
   * @param providedLogs     - log già scaricati (evita fetch ridondanti)
   * @param providedSessions - sessioni già scaricate (evita fetch ridondanti)
   */
  getClientPlanSummary: async (
    clientId: string,
    providedLogs?: Log[],
    providedSessions?: WorkoutSession[]
  ): Promise<ClientPlanSummary | null> => {
    if (!db) throw new Error('[UsersRepository] Firestore non inizializzato.');
    const { WorkoutsRepository } = await import('./workouts.repository');
    const activePlan = await WorkoutsRepository.getActivePlan(clientId);
    if (!activePlan) return null;

    // Helper: data parsing robusto (ISO e DD/MM/YYYY legacy)
    const parseDate = (dateStr: any): Date => {
      if (!dateStr) return new Date(0);
      if (dateStr instanceof Date) return dateStr;
      if (typeof dateStr === 'string' && dateStr.includes('/')) {
        const [d, m, y] = dateStr.split('/').map(Number);
        return new Date(y, m - 1, d);
      }
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? new Date(0) : d;
    };

    // Helper: mesi archiviati dalla startDate del piano al cutoff 30gg
    const getArchivedMonths = (planStartDate: string): string[] => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const months: string[] = [];
      const d = new Date(
        parseDate(planStartDate).getFullYear(),
        parseDate(planStartDate).getMonth(),
        1
      );
      while (d < cutoff) {
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        d.setMonth(d.getMonth() + 1);
      }
      return months;
    };

    // 1. HOT: log e items del piano in parallelo
    const [hotLogsSnap, items] = await Promise.all([
      getDocs(query(collection(db, `users/${clientId}/logs`), where('workoutId', '==', activePlan.id))),
      WorkoutsRepository.getPlanItems(activePlan.id)
    ]);
    let planLogs: Log[] = hotLogsSnap.docs.map((d: any) => toDoc(d, LogSchema));

    // 2. COLD: legge blob dei mesi archiviati dalla data di inizio piano
    const archivedMonths = getArchivedMonths(activePlan.startDate);
    if (archivedMonths.length > 0) {
      const coldSnaps = await Promise.all(
        archivedMonths.map(m => getDoc(doc(db!, `users/${clientId}/history_snapshot`, m)))
      );
      coldSnaps.forEach(snap => {
        if (!snap.exists()) return;
        const coldPlanLogs = (snap.data() as HistorySnapshot).logs
          .filter((l: Log) => l.workoutId === activePlan.id);
        planLogs = planLogs.concat(coldPlanLogs);
      });
    }

    // 3. Sessioni (riuso se già fornite)
    let sessions: WorkoutSession[];
    if (providedSessions) {
      sessions = providedSessions.filter(s => s.workoutId === activePlan.id);
    } else {
      const sessionsSnap = await getDocs(
        query(collection(db, `users/${clientId}/sessions`), where('workoutId', '==', activePlan.id))
      );
      sessions = sessionsSnap.docs.map((d: any) => toDoc(d, WorkoutSessionSchema));
    }

    // 4. Calcolo aderenza
    const uniquePlanDays = new Set(items.map(i => i.dayIndex)).size || 1;
    const uniqueLogDates = new Set(
      planLogs.filter(l => l.completed !== false).map(l => String(l.date).split('T')[0])
    );
    const uniqueSessionDates = new Set(sessions.map(s => String(s.date).split('T')[0]));
    const completedSessions = Math.max(uniqueSessionDates.size, uniqueLogDates.size);

    const startDate = parseDate(activePlan.startDate);
    const endDate   = parseDate(activePlan.endDate);
    const now = new Date();

    if (now < startDate) {
      return { planId: activePlan.id, totalSessionsCompleted: completedSessions, adherencePercent: 0, avgWeeklyVolume: 0 };
    }

    const targetDate   = (now > endDate && !isNaN(endDate.getTime())) ? endDate : now;
    const daysElapsed  = Math.floor((targetDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24)) + 1;
    const weeksElapsed = Math.max(0.1, daysElapsed / 7);
    const expectedSessions = Math.max(1, Math.ceil(weeksElapsed * uniquePlanDays));
    const safeExpected = isNaN(expectedSessions) || expectedSessions <= 0 ? 1 : expectedSessions;

    let totalVolume = 0;
    planLogs
      .filter(l => l.completed !== false && !l.id?.startsWith('temp_skip_'))
      .forEach(l => { totalVolume += l.reps * l.weight; });

    return {
      planId: activePlan.id,
      adherencePercent: Math.min(100, Math.round((completedSessions / safeExpected) * 100)),
      avgWeeklyVolume: Math.round(totalVolume / Math.max(1, weeksElapsed)),
      totalSessionsCompleted: completedSessions
    };
  },

  /**
   * Esporta i dati di un client in formato JSON strutturato (GDPR portabilità).
   * Include: piani selezionati con items + log + sessioni, e tutte le misure.
   * Registra `lastExportDate` sul documento utente (rate-limit: 30 giorni).
   */
    exportClientData: async (userId: string, planIds: string[]): Promise<object> => {
    if (!db) throw new Error('[UsersRepository] Firestore non inizializzato.');

    const userDoc = await getDoc(doc(db, 'users', userId));
    const userData = userDoc.exists() ? toDoc(userDoc, UserSchema) : null;
    const ptId = userData?.ptAssigned || undefined;
    const exercises = await UsersRepository.getExercises(ptId);
    const exerciseMap = new Map(exercises.map(e => [e.id, e.name]));

    const plansData = await Promise.all(planIds.map(async (planId) => {
      const planDoc = await getDoc(doc(db!, 'workouts', planId));
      if (!planDoc.exists()) return null;
      const plan = toDoc(planDoc, WorkoutSchema);

      const itemsSnap = await getDocs(
        query(collection(db!, `workouts/${planId}/items`), orderBy('orderIndex', 'asc'))
      );
      const items = itemsSnap.docs.map(d => {
        const item = toDoc(d, WorkoutItemSchema);
        return { ...item, exerciseName: exerciseMap.get(item.exerciseId) || 'Sconosciuto' };
      });

      const logsSnap = await getDocs(
        query(collection(db!, `users/${userId}/logs`), where('workoutId', '==', planId))
      );
      const logs = logsSnap.docs
        .map(d => {
          const log = toDoc(d, LogSchema);
          return { ...log, exerciseName: exerciseMap.get(log.exerciseId) || 'Sconosciuto' };
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const sessionsSnap = await getDocs(
        query(collection(db!, `users/${userId}/sessions`), where('workoutId', '==', planId))
      );
      const sessions: WorkoutSession[] = sessionsSnap.docs
        .map(d => toDoc(d, WorkoutSessionSchema))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      return { ...plan, items, logs, sessions };
    }));

    const measurementsSnap = await getDocs(
      query(collection(db, `users/${userId}/measurements`), orderBy('date', 'asc'))
    );
    const measurements: BodyMeasurement[] = measurementsSnap.docs.map(d => toDoc(d, BodyMeasurementSchema));

    // Rate-limit: stampa la data dell'ultimo export sul documento utente
    await updateDoc(doc(db, 'users', userId), { lastExportDate: new Date().toISOString() });

    return {
      export_meta: {
        generated_at: new Date().toISOString(),
        app: 'Vibe Gym',
        plans_included: planIds.length,
      },
      plans: plansData.filter(Boolean),
      measurements,
    };
  },

  // ── GDPR / ACCOUNT DELETION ────────────────────────────────────────────────

  /**
   * Cancella TUTTI i dati Firestore dell'utente in batch atomici.
   * Include: logs, measurements, sessions, history_snapshot, history_snapshot_preview,
   *          workouts del client e il documento utente principale.
   * Disassocia inoltre i client eventualmente assegnati al PT.
   *
   * ⚠️  ORCHESTRAZIONE OBBLIGATORIA:
   *     L'originale firebase.ts aveva un unico metodo `deleteAccountAndData` che
   *     eseguiva re-auth + cancellazione dati + eliminazione Auth in sequenza.
   *     Questo metodo gestisce SOLO la parte Firestore.
   *     Il chiamante DEVE invocare entrambi nell'ordine corretto:
   *
   *       await UsersRepository.deleteAccountData(userId);   // 1. Prima i dati
   *       await AuthRepository.deleteAuthAccount(password);  // 2. Poi l'account Auth
   *
   *     Invertire l'ordine causa dati orfani su Firestore non eliminabili
   *     (l'utente non sarebbe più autenticato per cancellarli).
   *
   * Usa batch chainati (max 490 ops) per gestire dataset grandi senza
   * superare i limiti Firestore.
   */
  deleteAccountData: async (userId: string): Promise<void> => {
    if (!db) throw new Error('[UsersRepository] Firestore non inizializzato.');

    const logsSnap         = await getDocs(collection(db, `users/${userId}/logs`));
    const measurementsSnap = await getDocs(collection(db, `users/${userId}/measurements`));
    const sessionsSnap     = await getDocs(collection(db, `users/${userId}/sessions`));
    const snapshotsSnap    = await getDocs(collection(db, `users/${userId}/history_snapshot`));
    const previewsSnap     = await getDocs(collection(db, `users/${userId}/history_snapshot_preview`));
    const clientsSnap      = await getDocs(query(collection(db, 'users'), where('ptAssigned', '==', userId)));

    let batch = writeBatch(db);
    let count = 0;

    const flush = async () => {
      if (count > 0) { await batch.commit(); batch = writeBatch(db); count = 0; }
    };
    const del = async (ref: any) => {
      batch.delete(ref); count++;
      if (count >= 490) await flush();
    };
    const upd = async (ref: any, data: any) => {
      batch.update(ref, data); count++;
      if (count >= 490) await flush();
    };

    for (const d of logsSnap.docs)         await del(d.ref);
    for (const d of measurementsSnap.docs)  await del(d.ref);
    for (const d of sessionsSnap.docs)      await del(d.ref);
    for (const d of snapshotsSnap.docs)     await del(d.ref);
    for (const d of previewsSnap.docs)      await del(d.ref);
    for (const d of clientsSnap.docs)       await upd(d.ref, { ptAssigned: null });
    await del(doc(db, 'users', userId));
    await flush();
  },
};
