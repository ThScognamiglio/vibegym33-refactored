import { db } from '../services/firebase.config';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';
import { getQueue, dequeueWrite, updateQueueItem, QueueItem } from './indexedDB';
import { invalidateLogsCache } from '../repositories/logs.repository';
import { invalidateSessionsCache } from '../repositories/sessions.repository';
import { getLocalDatePart } from '../date';

let isSyncing = false;
let retryTimeout: any = null;
let backoffMs = 2000; // start at 2s

export const getSyncStatus = () => isSyncing;

export const syncQueue = async (userId?: string): Promise<void> => {
  if (isSyncing) return;
  if (!navigator.onLine) return;
  if (!db) return;

  isSyncing = true;
  console.log('[SyncEngine] Starting sync...');

  try {
    const queue = await getQueue(userId);
    if (queue.length === 0) {
      console.log('[SyncEngine] Queue is empty.');
      isSyncing = false;
      backoffMs = 2000; // reset backoff
      return;
    }

    for (const item of queue) {
      if (!navigator.onLine) {
        console.log('[SyncEngine] Connection lost during sync.');
        break;
      }

      console.log(`[SyncEngine] Processing item ${item.id} of type ${item.type}...`);
      await updateQueueItem(item.id, { status: 'syncing' });

      try {
        await processQueueItem(item);
        await dequeueWrite(item.id);
        console.log(`[SyncEngine] Successfully synced item ${item.id}`);
      } catch (err: any) {
        console.error(`[SyncEngine] Failed to sync item ${item.id}:`, err);

        // Check if the error is a network error (recoverable) or a validation/permission error (unrecoverable)
        const isNetworkError =
          err.code === 'unavailable' ||
          err.code === 'deadline-exceeded' ||
          err.message?.includes('network') ||
          err.message?.includes('fetch') ||
          !navigator.onLine;

        if (isNetworkError) {
          // Increment attempts, set status to failed, and trigger backoff retry
          const nextAttempts = item.attempts + 1;
          await updateQueueItem(item.id, { status: 'failed', attempts: nextAttempts });
          
          // Schedule retry
          scheduleRetry(userId);
          isSyncing = false;
          return; // Stop processing the queue for now
        } else {
          // Unrecoverable error (e.g. permission-denied, invalid schema). Discard to avoid blocking queue.
          console.error(`[SyncEngine] Unrecoverable error. Discarding item ${item.id}`);
          await dequeueWrite(item.id);
        }
      }
    }

    // After successfully flushing, check if we need to sync again (in case items were added during sync)
    const remaining = await getQueue(userId);
    isSyncing = false;
    if (remaining.length > 0) {
      scheduleRetry(userId);
    } else {
      backoffMs = 2000; // reset backoff
    }
  } catch (globalErr) {
    console.error('[SyncEngine] Global error in syncQueue:', globalErr);
    isSyncing = false;
    scheduleRetry(userId);
  }
};

const scheduleRetry = (userId?: string) => {
  if (retryTimeout) clearTimeout(retryTimeout);
  console.log(`[SyncEngine] Scheduling retry in ${backoffMs}ms...`);
  retryTimeout = setTimeout(() => {
    syncQueue(userId);
  }, backoffMs);
  backoffMs = Math.min(backoffMs * 2, 30000); // exponential backoff up to 30s
};

const processQueueItem = async (item: QueueItem): Promise<void> => {
  if (!db) throw new Error('Firestore not initialized');

  const { type, payload, timestamp } = item;

  switch (type) {
    case 'logSet': {
      const { id, userId, date, workoutId, exerciseId, seriesNo } = payload;
      const logDocRef = doc(db, `users/${userId}/logs`, id);

      // Check if this document ID already exists
      const existingDoc = await getDoc(logDocRef);
      if (existingDoc.exists()) {
        const existingData = existingDoc.data();
        const existingClientTs = existingData.clientTimestamp || 0;
        if (timestamp > existingClientTs) {
          // Our queued write is newer, update it (LWW)
          await setDoc(logDocRef, {
            ...payload,
            clientTimestamp: timestamp,
            timestamp: serverTimestamp()
          }, { merge: true });
        }
        invalidateLogsCache();
        return;
      }

      // Check if a log with the same keys (date, workoutId, exerciseId, seriesNo) exists (deduplication)
      const day = getLocalDatePart(date);
      const q = query(
        collection(db, `users/${userId}/logs`),
        where('date', '>=', day),
        where('date', '<=', day + '\uf8ff'),
        where('workoutId', '==', workoutId),
        where('exerciseId', '==', exerciseId),
        where('seriesNo', '==', seriesNo)
      );
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        // Match found! Resolve conflict (LWW)
        const matchDoc = querySnap.docs[0];
        const matchData = matchDoc.data();
        const matchClientTs = matchData.clientTimestamp || 0;
        if (timestamp > matchClientTs) {
          // Our queued write is newer, update the matched document instead of creating a new one
          await setDoc(matchDoc.ref, {
            ...payload,
            id: matchDoc.id, // preserve the matched document ID to avoid duplicates
            clientTimestamp: timestamp,
            timestamp: serverTimestamp()
          }, { merge: true });
        }
        invalidateLogsCache();
        return;
      }

      // Create new document with our client ID
      await setDoc(logDocRef, {
        ...payload,
        clientTimestamp: timestamp,
        timestamp: serverTimestamp()
      });
      invalidateLogsCache();
      break;
    }

    case 'deleteLog': {
      const { userId, logId } = payload;
      const logDocRef = doc(db, `users/${userId}/logs`, logId);
      await deleteDoc(logDocRef);
      invalidateLogsCache();
      break;
    }

    case 'updateLog': {
      const { userId, logId, data } = payload;
      const logDocRef = doc(db, `users/${userId}/logs`, logId);

      const existingDoc = await getDoc(logDocRef);
      if (existingDoc.exists()) {
        const existingData = existingDoc.data();
        const existingClientTs = existingData.clientTimestamp || 0;
        if (timestamp > existingClientTs) {
          await updateDoc(logDocRef, {
            ...data,
            clientTimestamp: timestamp,
            timestamp: serverTimestamp()
          });
        }
      }
      invalidateLogsCache();
      break;
    }

    case 'saveSessionSummary': {
      const { id, userId, ...sessionData } = payload;
      if (!id) throw new Error('Missing session ID for sync');

      const sessionDocRef = doc(db, `users/${userId}/sessions`, id);
      const existingDoc = await getDoc(sessionDocRef);

      if (existingDoc.exists()) {
        const existingData = existingDoc.data();
        const existingClientTs = existingData.clientTimestamp || 0;
        if (timestamp > existingClientTs) {
          await setDoc(sessionDocRef, {
            ...sessionData,
            clientTimestamp: timestamp,
            timestamp: serverTimestamp()
          }, { merge: true });
        }
      } else {
        await setDoc(sessionDocRef, {
          ...sessionData,
          clientTimestamp: timestamp,
          timestamp: serverTimestamp()
        });
      }
      invalidateSessionsCache();
      break;
    }

    default:
      console.warn(`[SyncEngine] Unknown queue item type: ${type}`);
  }
};

// Start listening for connection changes
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[SyncEngine] Browser came online. Syncing queue...');
    syncQueue();
  });
}
