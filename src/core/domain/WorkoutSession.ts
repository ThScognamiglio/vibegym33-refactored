import { WorkoutSession as IWorkoutSession } from '../../types';
import { Log } from './Log';

export class WorkoutSession implements IWorkoutSession {
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

  constructor(raw: IWorkoutSession) {
    this.id = raw.id;
    this.userId = raw.userId;
    this.workoutId = raw.workoutId;
    this.dayIndex = raw.dayIndex;
    this.date = raw.date;
    this.volume = raw.volume;
    this.sets = raw.sets;
    this.avgRpe = raw.avgRpe;
    this.durationMinutes = raw.durationMinutes;
    this.activeSeconds = raw.activeSeconds;
  }

  static calculateTotals(
    logs: Log[],
    exercises: Record<string, { isBodyweight: boolean; isUnilateral?: boolean }>,
    resolvedBodyweight: number
  ): { volume: number; sets: number; avgRpe: string } {
    const completedLogs = logs.filter(l => l.completed !== false);
    let totalVolume = 0;
    let rpeSum = 0;
    let rpeCount = 0;

    completedLogs.forEach(l => {
      const ex = exercises[l.exerciseId] || { isBodyweight: false, isUnilateral: false };
      totalVolume += l.calculateVolume(ex, resolvedBodyweight);
      if (l.rpe !== undefined && l.rpe > 0) {
        rpeSum += l.rpe;
        rpeCount++;
      }
    });

    const sets = completedLogs.length;
    const avgRpe = rpeCount > 0 ? (rpeSum / rpeCount).toFixed(1) : '0.0';

    return {
      volume: totalVolume,
      sets,
      avgRpe
    };
  }
}
