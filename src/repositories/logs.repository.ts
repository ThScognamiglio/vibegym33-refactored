/**
 * logs.repository.ts
 *
 * RESPONSABILITÀ: operazioni CRUD sui log di allenamento e sul sistema
 * ibrido Hot/Cold (log recenti Firestore + blob mensili archiviati).
 *
 * DIPENDENZE CONSENTITE: firebase.config.ts, firebase/firestore, types.ts
 * NON importare da: components/, services/firebase.ts (legacy), core/, hooks/.
 *
 * ARCHITETTURA HOT/COLD:
 *   HOT  → users/{userId}/logs           (ultimi 30 giorni, documenti singoli)
 *   COLD → users/{userId}/history_snapshot/{YYYY-MM}  (blob mensili archiviati)
 *
 * AVVERTENZA LIMITE FIRESTORE: i blob COLD crescono con i log mensili.
 * Un utente attivo produce ~100-200 log/mese × ~200 byte ≈ 20-40 KB/mese.
 * Il limite Firestore è 1MB/documento. Monitorare logCount nel documento
 * per pianificare chunking/sharding se si avvicina a ~4000 log/mese.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../services/firebase.config';
import { Log, HistorySnapshot } from '../types';

import { z } from 'zod';
import { validatePayload, UserSchema, ExerciseSchema, BodyMeasurementSchema, WorkoutSchema, WorkoutItemSchema, LogSchema, WorkoutSessionSchema, HistorySnapshotSchema, HistorySnapshotPreviewSchema } from '../schemas';

// ─── IN-MEMORY CACHE ──────────────────────────────────────────────────────────
// Cache session-scoped per evitare letture Firestore ridondanti nella stessa
// sessione browser. TTL: 5 minuti. Si azzera ad ogni reload pagina.
// NON persistere questa cache su localStorage: i dati potrebbero essere stale.
const CACHE_TTL_MS = 5 * 60 * 1000;
interface CacheEntry<T> { data: T; fetchedAt: number; clientId: string; }
let _logsCache: CacheEntry<Log[]> | null = null;

const isCacheValid = (entry: CacheEntry<any> | null, clientId: string): boolean =>
  !!entry && entry.clientId === clientId && (Date.now() - entry.fetchedAt) < CACHE_TTL_MS;

export const invalidateLogsCache = () => { _logsCache = null; };

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Converte un DocumentSnapshot in un oggetto Log tipizzato. */
const toLog = (snap: any): Log => {
  const data = snap.data() || {};
  Object.keys(data).forEach(key => {
    if (data[key] instanceof Timestamp) data[key] = data[key].toDate().toISOString();
  });
  return { id: snap.id, uid: snap.id, ...data } as Log;
};

/**
 * Parsing robusto di date in formato ISO (YYYY-MM-DD o ISO 8601) e
 * formato legacy italiano (DD/MM/YYYY) prodotto da vecchi log.
 * Restituisce epoch 0 per valori nulli/malformati (evita crash nei sort).
 */
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

/** Restituisce tutti i mesi YYYY-MM nell'intervallo [fromDate, toDate). */
const getPastMonths = (fromDate: Date, toDate: Date = new Date()): string[] => {
  const months: string[] = [];
  const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  while (d < toDate) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() + 1);
  }
  return months;
};

// ─── LOGS REPOSITORY ─────────────────────────────────────────────────────────

export const LogsRepository = {

  /**
   * Salva un singolo set su Firestore (dati HOT).
   * Invalida la cache locale per forzare rilettura alla prossima query.
   */
  logSet: async (log: Omit<Log, 'id'>): Promise<string> => {
    if (!db) throw new Error('[LogsRepository] Firestore non inizializzato.');
    const ref = await addDoc(collection(db, `users/${log.userId}/logs`), {
      ...log,
      timestamp: serverTimestamp(),
    });
    invalidateLogsCache();
    return ref.id;
  },

  /** Elimina un log per ID. Invalida la cache. */
  deleteLog: async (userId: string, logId: string): Promise<void> => {
    if (!db) throw new Error('[LogsRepository] Firestore non inizializzato.');
    await deleteDoc(doc(db, `users/${userId}/logs/${logId}`));
    invalidateLogsCache();
  },

  /** Aggiornamento parziale di un log (es. correzione rpe, note). */
  updateLog: async (userId: string, logId: string, data: Partial<Log>): Promise<void> => {
    if (!db) throw new Error('[LogsRepository] Firestore non inizializzato.');
    await updateDoc(doc(db, `users/${userId}/logs/${logId}`), data as any);
  },

  /**
   * Recupera TUTTI i log del client (HOT + opzionalmente COLD).
   * Applica deduplicazione per chiave (date, workoutId, exerciseId, seriesNo)
   * e filtra i log "skip" (completed: false o prefisso 'temp_skip_').
   *
   * @param fullHistory - se true, legge anche i blob mensili archiviati (COLD).
   *   Usare con cautela: può generare ~N read Firestore (1 per mese di vita utente).
   */
  getAllLogsForClient: async (clientId: string, fullHistory = false): Promise<Log[]> => {
    if (!db) throw new Error('[LogsRepository] Firestore non inizializzato.');

    if (isCacheValid(_logsCache, clientId)) {
      console.log('[LogsRepository] 📦 Cache hit: logs');
      return _logsCache!.data;
    }

    // HOT: log degli ultimi 30 giorni
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const hotCutoffStr = cutoff.toISOString().split('T')[0];
    const hotSnap = await getDocs(query(
      collection(db, `users/${clientId}/logs`),
      where('date', '>=', hotCutoffStr),
      orderBy('date', 'desc')
    ));
    const hotLogs = hotSnap.docs.map(toLog);

    // COLD: blob mensili archiviati (opzionale)
    let coldLogs: Log[] = [];
    if (fullHistory) {
      const snapshotCol = await getDocs(collection(db, `users/${clientId}/history_snapshot`));
      snapshotCol.forEach(snap => {
        coldLogs = coldLogs.concat((snap.data() as HistorySnapshot).logs);
      });
    }

    // Merge, deduplicazione e filtraggio
    const raw = [...hotLogs, ...coldLogs].sort(
      (a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime()
    );
    const seen = new Set<string>();
    const clean: Log[] = [];
    raw.forEach(log => {
      if (log.completed === false || log.id?.startsWith('temp_skip_')) return;
      const day = String(log.date).split('T')[0];
      const key = `${day}_${log.workoutId}_${log.exerciseId}_${log.seriesNo}`;
      if (!seen.has(key)) { seen.add(key); clean.push(log); }
    });

    _logsCache = { clientId, data: clean, fetchedAt: Date.now() };
    return clean;
  },

  /** Log della sessione corrente per uno specifico esercizio (oggi). */
  getSessionLogs: async (userId: string, workoutId: string, exerciseId: string): Promise<Log[]> => {
    if (!db) throw new Error('[LogsRepository] Firestore non inizializzato.');
    const today = new Date().toISOString().split('T')[0];
    const tomorrowOffset = new Date();
    tomorrowOffset.setDate(tomorrowOffset.getDate() + 1);
    const tomorrow = tomorrowOffset.toISOString().split('T')[0];
    const snap = await getDocs(query(
      collection(db, `users/${userId}/logs`),
      where('date', '>=', today),
      where('date', '<', tomorrow)
    ));
    return snap.docs
      .map(toLog)
      .filter(l => l.workoutId === workoutId && l.exerciseId === exerciseId)
      .sort((a, b) => a.seriesNo - b.seriesNo);
  },

  /** Tutti i log di oggi per un determinato piano. */
  getWorkoutTodayLogs: async (userId: string, workoutId: string): Promise<Log[]> => {
    if (!db) throw new Error('[LogsRepository] Firestore non inizializzato.');
    const today = new Date().toISOString().split('T')[0];
    const tomorrowOffset = new Date();
    tomorrowOffset.setDate(tomorrowOffset.getDate() + 1);
    const tomorrow = tomorrowOffset.toISOString().split('T')[0];
    const snap = await getDocs(query(
      collection(db, `users/${userId}/logs`),
      where('date', '>=', today),
      where('date', '<', tomorrow)
    ));
    return snap.docs.map(toLog).filter(l => l.workoutId === workoutId);
  },

  /**
   * Recupera l'ultima prestazione per un esercizio specifico.
   * Cerca prima nei log HOT; se vuoti, scansiona i blob COLD degli ultimi 4 mesi.
   * Restituisce null se non esiste storia.
   */
  getLastPerformance: async (userId: string, exerciseId: string): Promise<Log[] | null> => {
    if (!db) throw new Error('[LogsRepository] Firestore non inizializzato.');
    const today = new Date().toISOString().split('T')[0];

    const hotSnap = await getDocs(query(
      collection(db, `users/${userId}/logs`),
      where('exerciseId', '==', exerciseId),
      where('date', '<', today),
      orderBy('date', 'desc'),
      limit(20)
    ));

    let logs: Log[] = [];
    if (!hotSnap.empty) {
      logs = hotSnap.docs.map(toLog);
    } else {
      // Fallback COLD: scansione inversa degli ultimi 4 mesi
      const start = new Date();
      start.setMonth(start.getMonth() - 4);
      const months = getPastMonths(start).reverse();
      for (const month of months) {
        const monthQuery = query(collection(db, `users/${userId}/history_snapshot`), where('month', '==', month));
        const monthSnaps = await getDocs(monthQuery);
        if (monthSnaps.empty) continue;

        let monthLogs: any[] = [];
        monthSnaps.forEach(snap => {
            monthLogs = monthLogs.concat((snap.data() as HistorySnapshot).logs || []);
        });

        const coldLogs = monthLogs
          .filter(l => l.exerciseId === exerciseId && l.date < today)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 20);
        if (coldLogs.length > 0) { logs = coldLogs; break; }
      }
    }

    if (!logs.length) return null;
    const lastDate = logs[0].date.split('T')[0];
    return logs
      .filter(l => l.date.split('T')[0] === lastDate)
      .sort((a, b) => a.seriesNo - b.seriesNo);
  },

  /**
   * Archiviazione ibrida: sposta i log HOT più vecchi di 30 giorni in blob COLD.
   *
   * FASI:
   *   A. Lettura snapshot esistente (idempotenza: safe se chiamata 2 volte)
   *   B. Scrittura blob COLD (merge con esistente)
   *   C. Verifica integrità (logCount === mergedLogs.length)
   *   D. Scrittura preview leggera (solo date attive, per heatmap)
   *   E. Cancellazione HOT in batch (max 490 ops per batch)
   *
   * ANTI-CONCORRENZA: il flag `archivingInProgress` su Firestore blocca
   * esecuzioni parallele da device multipli (es. tablet + telefono).
   *
   * THROTTLE: max 1 esecuzione al giorno per utente (`lastArchiveDate`).
   *
   * AVVERTENZA LIMITE 1MB: monitorare `logCount` nel blob. Se supera ~4000
   * log/mese, implementare shard mensili (es. {YYYY-MM}-01, {YYYY-MM}-02).
   */
  archiveOldLogs: async (
    userId: string,
    dryRun = false
  ): Promise<{ archivedMonths: number; deletedDocs: number; dryRun: boolean }> => {
    if (!db) throw new Error('[LogsRepository] Firestore non inizializzato.');

    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data() || {};
    const today = new Date().toISOString().split('T')[0];

    // Throttle giornaliero
    if (userData.lastArchiveDate === today) {
      console.log('[LogsRepository] archiveOldLogs: già eseguito oggi, skip.');
      return { archivedMonths: 0, deletedDocs: 0, dryRun };
    }
    // Lock anti-concorrenza
    if (userData.archivingInProgress === true) {
      console.warn('[LogsRepository] archiveOldLogs: già in corso su altro device.');
      return { archivedMonths: 0, deletedDocs: 0, dryRun };
    }
    if (!dryRun) await updateDoc(userRef, { archivingInProgress: true });

    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffStr = cutoff.toISOString().split('T')[0];

      const oldSnap = await getDocs(query(
        collection(db, `users/${userId}/logs`),
        where('date', '<', cutoffStr),
        orderBy('date', 'asc')
      ));

      if (oldSnap.empty) {
        if (!dryRun) await updateDoc(userRef, { archivingInProgress: false, lastArchiveDate: today });
        return { archivedMonths: 0, deletedDocs: 0, dryRun };
      }

      // Raggruppamento per mese
      const byMonth: Record<string, { docs: typeof oldSnap.docs; logs: any[] }> = {};
      oldSnap.docs.forEach(d => {
        const data = d.data();
        const month = String(data.date).substring(0, 7);
        if (!byMonth[month]) byMonth[month] = { docs: [], logs: [] };
        byMonth[month].docs.push(d);
        byMonth[month].logs.push({
          id: d.id,
          date: data.date,
          exerciseId: data.exerciseId,
          workoutId: data.workoutId,
          reps: data.reps,
          weight: data.weight,
          seriesNo: data.seriesNo,
          completed: data.completed ?? true,
          rpe: data.rpe,
          note: data.note,
        });
      });

      let totalDeletedDocs = 0;
      let archivedMonths = 0;

      for (const [month, { docs, logs }] of Object.entries(byMonth)) {
        const previewRef  = doc(db, `users/${userId}/history_snapshot_preview`, month);

        // FASE A: Recupero tutti gli eventuali shard del mese (es. "2026-05", "2026-05_1", ecc.)
        const monthQuery = query(collection(db, `users/${userId}/history_snapshot`), where('month', '==', month));
        const existingSnaps = await getDocs(monthQuery);
        
        let existingLogs: any[] = [];
        existingSnaps.forEach(snap => {
            existingLogs = existingLogs.concat(snap.data().logs || []);
        });

        const existingIds = new Set(existingLogs.map((l: any) => l.id));
        const newLogsToArchive = logs.filter(l => !existingIds.has(l.id));
        const mergedLogs = [...existingLogs, ...newLogsToArchive];

        if (!dryRun) {
          // FASE B: Sharding (limite di 2000 log per doc, ~300KB, ben sotto il limite 1MB di Firestore)
          const CHUNK_SIZE = 2000;
          let shardVerifiedCount = 0;

          for (let i = 0; i < mergedLogs.length; i += CHUNK_SIZE) {
            const chunk = mergedLogs.slice(i, i + CHUNK_SIZE);
            const shardIndex = i / CHUNK_SIZE;
            const shardDocId = shardIndex === 0 ? month : `${month}_${shardIndex}`;
            const snapshotRef = doc(db, `users/${userId}/history_snapshot`, shardDocId);

            await setDoc(snapshotRef, {
              month,
              shardIndex,
              archivedAt: new Date().toISOString(),
              logCount: chunk.length,
              logs: chunk,
            });

            // FASE C: verifica integrità di ogni shard prima di considerare i log "archiviati"
            const verify = await getDoc(snapshotRef);
            if (verify.exists() && verify.data().logCount === chunk.length) {
              shardVerifiedCount += chunk.length;
            }
          }

          if (shardVerifiedCount !== mergedLogs.length) {
            console.error(`[LogsRepository] Verifica fallita per il mese ${month}. HOT log NON cancellati.`);
            continue;
          }

          // FASE D: preview leggera (solo date attive)
          const activeDates = [...new Set(
            mergedLogs
              .filter((l: any) => l.completed !== false)
              .map((l: any) => String(l.date).split('T')[0])
          )].sort();
          await setDoc(previewRef, { month, activeDates });

          // FASE E: cancella HOT in batch (max 490 ops/batch)
          const BATCH_SIZE = 490;
          for (let i = 0; i < docs.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref));
            await batch.commit();
            totalDeletedDocs += Math.min(BATCH_SIZE, docs.length - i);
          }
          invalidateLogsCache();
        }

        archivedMonths++;
        console.log(`[LogsRepository] ✅ Archive: mese ${month} ${dryRun ? '(dry-run)' : 'archiviato'} (${mergedLogs.length} log).`);
      }

      if (!dryRun) {
        await updateDoc(userRef, { archivingInProgress: false, lastArchiveDate: today });
      }
      return { archivedMonths, deletedDocs: totalDeletedDocs, dryRun };

    } catch (err) {
      console.error('[LogsRepository] archiveOldLogs errore:', err);
      if (!dryRun) await updateDoc(userRef, { archivingInProgress: false }).catch(() => {});
      throw err;
    }
  },
};
