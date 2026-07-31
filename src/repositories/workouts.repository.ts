/**
 * workouts.repository.ts
 *
 * RESPONSABILITÀ: CRUD sui piani di allenamento (Workout) e sui loro item.
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
  setDoc,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../services/firebase.config';
import { Workout, WorkoutItem } from '../types';

import { z } from 'zod';
import { validatePayload, UserSchema, ExerciseSchema, BodyMeasurementSchema, WorkoutSchema, WorkoutItemSchema, LogSchema, WorkoutSessionSchema, HistorySnapshotSchema, HistorySnapshotPreviewSchema } from '../schemas';

// ─── HELPER ───────────────────────────────────────────────────────────────────
const toDoc = <T>(snap: any, schema: z.ZodType<T>): T => {
  const data = snap.data() || {};
  Object.keys(data).forEach(key => {
    if (data[key] instanceof Timestamp) data[key] = data[key].toDate().toISOString();
  });
  const raw = { id: snap.id, uid: snap.id, ...data };
  return validatePayload(schema, raw);
};

// ─── WORKOUTS REPOSITORY ─────────────────────────────────────────────────────

export const WorkoutsRepository = {

  /** Recupera un singolo piano per ID. Ritorna null se non esiste. */
  getWorkout: async (workoutId: string): Promise<Workout | null> => {
    if (!db) throw new Error('[WorkoutsRepository] Firestore non inizializzato.');
    const snap = await getDoc(doc(db, 'workouts', workoutId));
    return snap.exists() ? toDoc(snap, WorkoutSchema) : null;
  },

  /** Recupera il piano ACTIVE di un client. Ritorna null se non ne ha uno. */
  getActivePlan: async (clientId: string): Promise<Workout | null> => {
    if (!db) throw new Error('[WorkoutsRepository] Firestore non inizializzato.');
    const snap = await getDocs(query(
      collection(db, 'workouts'),
      where('clientId', '==', clientId),
      where('status', '==', 'ACTIVE')
    ));
    if (snap.empty) return null;
    const workouts = snap.docs.map(d => toDoc(d, WorkoutSchema));
    workouts.sort((a, b) => b.startDate.localeCompare(a.startDate));
    return workouts[0];
  },

  /** Tutti i piani (attivi e archiviati) di un client. */
  getWorkoutsForClient: async (clientId: string): Promise<Workout[]> => {
    if (!db) throw new Error('[WorkoutsRepository] Firestore non inizializzato.');
    const snap = await getDocs(query(
      collection(db, 'workouts'),
      where('clientId', '==', clientId)
    ));
    return snap.docs.map(d => toDoc(d, WorkoutSchema));
  },

  /** Recupera gli item (esercizi) di un piano, ordinati per `orderIndex`. */
  getPlanItems: async (workoutId: string): Promise<WorkoutItem[]> => {
    if (!db) throw new Error('[WorkoutsRepository] Firestore non inizializzato.');
    const snap = await getDocs(query(
      collection(db, `workouts/${workoutId}/items`),
      orderBy('orderIndex', 'asc')
    ));
    return snap.docs.map(d => toDoc(d, WorkoutItemSchema));
  },

  /**
   * Crea un nuovo piano con i relativi item in un'unica batch transaction.
   * La batch garantisce atomicità: o tutto viene creato, o nulla.
   */
  createWorkout: async (
    ptId: string,
    clientId: string,
    name: string,
    items: {
      exerciseId: string;
      dayIndex: number;
      sets: number;
      reps: number;
      restSeconds: number;
      supersetGroup?: string;
    }[],
    endDate?: string
  ): Promise<Workout> => {
    if (!db) throw new Error('[WorkoutsRepository] Firestore non inizializzato.');
    const batch = writeBatch(db);
    const workoutRef = doc(collection(db, 'workouts'));
    const workoutData = {
      ptId,
      clientId,
      name,
      status: 'ACTIVE',
      startDate: new Date().toISOString(),
      endDate: endDate || new Date(Date.now() + 86400000 * 30).toISOString(),
      createdAt: serverTimestamp(),
    };
    batch.set(workoutRef, workoutData);
    items.forEach((item, index) => {
      const itemRef = doc(collection(db, `workouts/${workoutRef.id}/items`));
      batch.set(itemRef, {
        workoutId: workoutRef.id,
        exerciseId: item.exerciseId,
        dayIndex: item.dayIndex,
        sets: item.sets,
        reps: item.reps,
        restSeconds: item.restSeconds,
        orderIndex: index,
        supersetGroup: item.supersetGroup || null,
      });
    });
    await batch.commit();
    return { id: workoutRef.id, ...workoutData } as Workout;
  },

  /**
   * Aggiorna un piano esistente: nome, endDate e lista item.
   * Strategia: delete + recreate per gli item (nessuna patch parziale).
   * Usa batch chainati (max 499 ops ciascuno) per gestire piani grandi.
   */
  updateWorkoutPlan: async (
    workoutId: string,
    name: string,
    items: {
      exerciseId: string;
      dayIndex: number;
      sets: number;
      reps: number;
      restSeconds: number;
      supersetGroup?: string;
    }[],
    endDate: string
  ): Promise<void> => {
    if (!db) throw new Error('[WorkoutsRepository] Firestore non inizializzato.');
    const MAX_OPS = 499;
    let batch = writeBatch(db);
    let opsCount = 0;

    const flushIfNeeded = async () => {
      if (opsCount >= MAX_OPS) {
        await batch.commit();
        batch = writeBatch(db);
        opsCount = 0;
      }
    };

    const workoutRef = doc(db, 'workouts', workoutId);
    batch.update(workoutRef, { name, endDate, updatedAt: serverTimestamp() });
    opsCount++;
    await flushIfNeeded();

    // Elimina gli item esistenti
    const oldItems = await getDocs(collection(db, `workouts/${workoutId}/items`));
    for (const d of oldItems.docs) {
      batch.delete(d.ref);
      opsCount++;
      await flushIfNeeded();
    }

    // Crea nuovi item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemRef = doc(collection(db, `workouts/${workoutRef.id}/items`));
      batch.set(itemRef, {
        workoutId: workoutRef.id,
        exerciseId: item.exerciseId,
        dayIndex: item.dayIndex,
        sets: item.sets,
        reps: item.reps,
        restSeconds: item.restSeconds,
        orderIndex: i,
        supersetGroup: item.supersetGroup || null,
      });
      opsCount++;
      await flushIfNeeded();
    }

    if (opsCount > 0) await batch.commit();
  },

  /** Elimina un piano per ID. */
  deleteWorkout: async (workoutId: string): Promise<void> => {
    if (!db) throw new Error('[WorkoutsRepository] Firestore non inizializzato.');
    await deleteDoc(doc(db, 'workouts', workoutId));
  },
};
