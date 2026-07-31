import { Log, WorkoutSession } from '../types';

export interface ActiveSessionState {
  userId: string;
  workoutId: string;
  dayIndex: number;
  activeItemIndex: number;
  reps: number;
  weight: number;
  rpe: number;
  note: string;
  allLogs: Record<string, Log[]>;
  activeSeconds: number;
  currentSessionId?: string;
  sessionVolume: number;
  setsCompleted: number;
  sessionRpeSum: number;
  timerState?: {
    duration: number;
    endTime: number;
    isPaused: boolean;
    pausedAt: number | null;
  };
  lastUpdated: number;
}

export interface QueueItem {
  id: string; // Client-side UUID
  userId: string;
  type: 'logSet' | 'deleteLog' | 'updateLog' | 'saveSessionSummary';
  payload: any;
  timestamp: number; // Client timestamp for Last Write Wins
  status: 'pending' | 'syncing' | 'failed';
  attempts: number;
}

const DB_NAME = 'VibeGymOfflineDB';
const DB_VERSION = 1;

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[IndexedDB] Failed to open database');
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = request.result;
      
      // Store for active sessions, keyed by userId
      if (!db.objectStoreNames.contains('activeSession')) {
        db.createObjectStore('activeSession', { keyPath: 'userId' });
      }

      // Store for the write queue, keyed by unique ID (UUID)
      if (!db.objectStoreNames.contains('writeQueue')) {
        const queueStore = db.createObjectStore('writeQueue', { keyPath: 'id' });
        queueStore.createIndex('userId', 'userId', { unique: false });
        queueStore.createIndex('status', 'status', { unique: false });
      }
    };
  });
};

// --- Active Session Storage ---

export const saveActiveSession = async (session: ActiveSessionState): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('activeSession', 'readwrite');
    const store = tx.objectStore('activeSession');
    const request = store.put(session);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getActiveSession = async (userId: string): Promise<ActiveSessionState | null> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('activeSession', 'readonly');
    const store = tx.objectStore('activeSession');
    const request = store.get(userId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

export const clearActiveSession = async (userId: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('activeSession', 'readwrite');
    const store = tx.objectStore('activeSession');
    const request = store.delete(userId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// --- Write Queue Storage ---

export const enqueueWrite = async (
  userId: string,
  type: QueueItem['type'],
  payload: any
): Promise<QueueItem> => {
  const db = await initDB();
  const id = 'queue_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  const item: QueueItem = {
    id,
    userId,
    type,
    payload,
    timestamp: Date.now(),
    status: 'pending',
    attempts: 0
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('writeQueue', 'readwrite');
    const store = tx.objectStore('writeQueue');
    const request = store.add(item);

    request.onsuccess = () => resolve(item);
    request.onerror = () => reject(request.error);
  });
};

export const getQueue = async (userId?: string): Promise<QueueItem[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('writeQueue', 'readonly');
    const store = tx.objectStore('writeQueue');
    const request = store.getAll();

    request.onsuccess = () => {
      let items = request.result || [];
      if (userId) {
        items = items.filter(item => item.userId === userId);
      }
      // Sort by timestamp to ensure FIFO processing
      items.sort((a, b) => a.timestamp - b.timestamp);
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
};

export const dequeueWrite = async (id: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('writeQueue', 'readwrite');
    const store = tx.objectStore('writeQueue');
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const updateQueueItem = async (id: string, updates: Partial<QueueItem>): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('writeQueue', 'readwrite');
    const store = tx.objectStore('writeQueue');
    
    // Get the item first
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const item = getRequest.result;
      if (!item) {
        resolve(); // or reject if appropriate, but resolve is safer if it's already removed
        return;
      }
      
      const updatedItem = { ...item, ...updates };
      const putRequest = store.put(updatedItem);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
};
