
import { Equipment } from '../core/domain/Equipment';

export type Role = 'pt' | 'client';

export interface User {
  uid: string;
  name: string;
  email: string;
  role: Role;
  ptAssigned: string | null; // PT's UID
  inviteCode?: string; // Only for PT
  createdAt: string;
  isActive?: boolean; // Controls approval status
  isAdmin?: boolean; // NEW: Controls Admin access
  // Profile Fields
  height?: number;
  weight?: number;
  goal?: string;
  lastExportDate?: string; // ISO date of last data export (rate-limit: 30 days)
  // ─── Hybrid Archive System ───────────────────────────────────────────────
  lastArchiveDate?: string;      // "YYYY-MM-DD" — throttle: max 1 archiviazione/giorno
  archivingInProgress?: boolean; // Lock anti-concorrenza multi-device
  firstArchiveDone?: boolean;    // true dopo che la prima archiviazione completa è avvenuta
}

export interface Exercise {
  id: string;
  ptId: string;
  groupId: string;
  name: string;
  description: string;
  equipment: Equipment;
  level: 'beginner' | 'intermediate' | 'advanced';
  measurement?: 'reps' | 'time'; // Distinguish between Reps based and Time based (e.g. Plank)
  videoUrl?: string;
  nscaCategory?: string;
  isUnilateral?: boolean;
}

export interface Workout {
  id: string;
  ptId: string;
  clientId: string;
  name: string;
  status: 'DRAFT' | 'ACTIVE';
  startDate: string;
  endDate: string;
}

export interface WorkoutItem {
  id: string;
  workoutId: string;
  exerciseId: string;
  dayIndex: number; // 0 = Monday/Day 1, etc.
  sets: number;
  reps: number; // For time-based exercises, this stores Seconds
  restSeconds: number;
  orderIndex: number;
  supersetGroup?: string; // "A", "B", "C" or undefined for straight sets
}

export interface Log {
  id: string;
  userId: string;
  workoutId: string;
  itemId: string;
  exerciseId: string;
  date: string;
  seriesNo: number;
  reps: number; // Stores Seconds if exercise.measurement === 'time'
  weight: number;
  completed: boolean;
  rpe?: number;  // RPE 1-10, stored directly (older logs may not have this field)
  note?: string;
  bodyweightAtLog?: number;
}

export interface BodyMeasurement {
  id: string;
  userId: string;
  date: string;
  weight: number;
  neck?: number;        // Collo
  shoulders?: number;   // Spalle
  chest?: number;       // Torace
  bicep?: number;       // Braccio
  forearm?: number;     // Avambraccio
  waist?: number;       // Vita
  hips?: number;        // Fianchi
  thigh?: number;       // Coscia Alta
  lowerThigh?: number;  // Coscia Bassa
  calf?: number;        // Polpaccio
  arms?: number;        // Legacy field kept for backward compatibility (mapped to bicep in UI if needed)
}

// Aggregated Data (Read-only for client)
export interface ClientExerciseSummary {
  exerciseId: string;
  totalSessions: number;
  totalReps: number;
  avgWeight: number;
  pr: number;
  lastUpdated: string;
}

export interface ClientPlanSummary {
  planId: string;
  adherencePercent: number;
  avgWeeklyVolume: number;
  totalSessionsCompleted: number;
}

export interface WorkoutSession {
  id: string;
  userId: string;
  workoutId: string;
  dayIndex: number;
  date: string;
  volume: number;
  sets: number;
  avgRpe: string;
  durationMinutes: number;
  activeSeconds?: number;
}

// ─── Hybrid Archive System ───────────────────────────────────────────────────

/**
 * Documento COLD per mese: users/{userId}/history_snapshot/{YYYY-MM}
 * Contiene tutti i log archiviati del mese (> 30 giorni fa).
 * Limite pratico: ~200 log/mese × ~200 byte ≈ 40 KB << limite 1 MB Firestore.
 */
export interface HistorySnapshot {
  month: string;       // "YYYY-MM"
  archivedAt: string;  // ISO timestamp dell'ultima archiviazione
  logCount: number;    // Numero log (per verifica integrità)
  logs: Log[];         // Array completo dei log del mese
}

/**
 * Documento PREVIEW leggero: users/{userId}/history_snapshot_preview/{YYYY-MM}
 * Contiene solo le date con sessioni attive (~500 byte).
 * Serve alla ConsistencyHeatmap per evitare di leggere i blob completi.
 */
export interface HistorySnapshotPreview {
  month: string;          // "YYYY-MM"
  activeDates: string[];  // Array di date "YYYY-MM-DD" con almeno 1 log completato
}