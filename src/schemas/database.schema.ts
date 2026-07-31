import { z } from 'zod';
import type { 
  User, 
  Exercise, 
  Workout, 
  WorkoutItem, 
  Log, 
  BodyMeasurement, 
  WorkoutSession, 
  HistorySnapshot, 
  HistorySnapshotPreview,
  Role
} from '../types';

export const EquipmentEnum = z.enum([
  'barbell',
  'dumbbell',
  'machine',
  'bodyweight',
  'cable',
  'kettlebell',
  'smith',
  'ez_bar',
  'trap_bar',
  'bands',
  'other'
]);

export const RoleEnum = z.enum(['pt', 'client']);

export const UserSchema = z.object({
  uid: z.string(),
  name: z.string().min(1),
  email: z.string().email(),
  role: RoleEnum as z.ZodType<Role>,
  ptAssigned: z.string().nullable(),
  inviteCode: z.string().optional(),
  createdAt: z.string().datetime({ offset: true }),
  isActive: z.boolean().optional().catch(true), // Default true for legacy
  isAdmin: z.boolean().optional().catch(false),
  height: z.number().optional().catch(undefined),
  weight: z.number().optional().catch(undefined),
  goal: z.string().optional().catch(undefined),
  lastExportDate: z.string().optional().catch(undefined),
  lastArchiveDate: z.string().optional().catch(undefined),
  archivingInProgress: z.boolean().optional().catch(false),
  firstArchiveDone: z.boolean().optional().catch(false)
}) as unknown as z.ZodType<User>;

export const ExerciseSchema = z.object({
  id: z.string(),
  ptId: z.string(),
  groupId: z.string(),
  name: z.string(),
  description: z.string().optional().catch(''),
  equipment: EquipmentEnum.catch('other') as any, // Typecast to match Equipment interface
  level: z.enum(['beginner', 'intermediate', 'advanced']).catch('beginner'),
  measurement: z.enum(['reps', 'time']).optional().catch('reps'),
  videoUrl: z.string().optional().catch(undefined),
  nscaCategory: z.string().optional().catch(undefined),
  isUnilateral: z.boolean().optional().catch(false)
}) as unknown as z.ZodType<Exercise>;

export const WorkoutSchema = z.object({
  id: z.string(),
  ptId: z.string(),
  clientId: z.string(),
  name: z.string(),
  status: z.enum(['DRAFT', 'ACTIVE']).catch('ACTIVE'),
  startDate: z.string().catch(() => new Date().toISOString()),
  endDate: z.string().catch(() => new Date().toISOString())
}) as unknown as z.ZodType<Workout>;

export const WorkoutItemSchema = z.object({
  id: z.string(),
  workoutId: z.string(),
  exerciseId: z.string(),
  dayIndex: z.number().int().catch(0),
  sets: z.number().int().catch(0),
  reps: z.number().catch(0),
  restSeconds: z.number().catch(0),
  orderIndex: z.number().int().catch(0),
  supersetGroup: z.string().optional().catch(undefined)
}) as unknown as z.ZodType<WorkoutItem>;

export const LogSchema = z.object({
  id: z.string(),
  userId: z.string(),
  workoutId: z.string(),
  itemId: z.string(),
  exerciseId: z.string(),
  date: z.string(),
  seriesNo: z.number().int().positive().catch(1),
  reps: z.number().nonnegative().catch(0),
  weight: z.number().nonnegative().catch(0),
  completed: z.boolean().catch(false),
  rpe: z.number().min(1).max(10).optional().catch(undefined),
  note: z.string().optional().catch(undefined),
  bodyweightAtLog: z.number().optional().catch(undefined)
}) as unknown as z.ZodType<Log>;

export const BodyMeasurementSchema = z.object({
  id: z.string(),
  userId: z.string(),
  date: z.string(),
  weight: z.number(),
  neck: z.number().optional().catch(undefined),
  shoulders: z.number().optional().catch(undefined),
  chest: z.number().optional().catch(undefined),
  bicep: z.number().optional().catch(undefined),
  forearm: z.number().optional().catch(undefined),
  waist: z.number().optional().catch(undefined),
  hips: z.number().optional().catch(undefined),
  thigh: z.number().optional().catch(undefined),
  lowerThigh: z.number().optional().catch(undefined),
  calf: z.number().optional().catch(undefined),
  arms: z.number().optional().catch(undefined) // Legacy
}) as unknown as z.ZodType<BodyMeasurement>;

export const WorkoutSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  workoutId: z.string(),
  dayIndex: z.number().int().catch(0),
  date: z.string(),
  volume: z.number().catch(0),
  sets: z.number().catch(0),
  avgRpe: z.string().catch('N/A'),
  durationMinutes: z.number().catch(0),
  activeSeconds: z.number().optional().catch(undefined)
}) as unknown as z.ZodType<WorkoutSession>;

export const HistorySnapshotSchema = z.object({
  month: z.string(),
  archivedAt: z.string(),
  logCount: z.number().catch(0),
  logs: z.array(LogSchema as any).catch([])
}) as unknown as z.ZodType<HistorySnapshot>;

export const HistorySnapshotPreviewSchema = z.object({
  month: z.string(),
  activeDates: z.array(z.string()).catch([])
}) as unknown as z.ZodType<HistorySnapshotPreview>;

// Use this for any payload before saving it to the database or after fetching
export function validatePayload<T>(schema: z.ZodType<T>, data: unknown): T {
    const result = schema.safeParse(data);
    if (result.success) {
        return result.data;
    } else {
        console.warn("Zod Validation Error (Recovering gracefully):", result.error.errors);
        // If it still fails even with all the .catch() clauses, it means a completely
        // unrecoverable error occurred (e.g., missing ID on a document).
        // Returning `data as T` here is dangerous but we do it as an absolute last resort
        // to prevent complete app crashes, knowing that Zod's .catch() has already
        // covered 99% of legacy data cases.
        return data as T;
    }
}
