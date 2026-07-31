import { getLocalDatePart, getLocalTodayString } from './timezone';
import { getWeekStart } from './ranges';

export interface LogLike {
  date: string;
  weight: number;
  reps: number;
  completed?: boolean;
  id?: string;
  exerciseId: string;
}

export interface SessionLike {
  date: string;
  volume: number;
  sets: number;
  workoutId: string;
  dayIndex?: number;
}

/**
 * Calculates differences in days between two dates.
 */
export function getDaysDifference(dateLeft: Date | string, dateRight: Date | string): number {
  const leftPart = getLocalDatePart(dateLeft);
  const rightPart = getLocalDatePart(dateRight);
  const left = new Date(leftPart);
  const right = new Date(rightPart);
  const diffTime = left.getTime() - right.getTime();
  return diffTime / (1000 * 60 * 60 * 24);
}

/**
 * Groups logs by week (Monday-Sunday) and calculates volume.
 * Initializes the last N weeks with 0 volume.
 */
export function groupVolumeByWeeks(
  logs: LogLike[],
  numWeeks = 6
): Map<number, number> {
  const weeksMap = new Map<number, number>();
  const today = new Date();
  const currentWeekStart = getWeekStart(today).getTime();

  // Initialize weeks with 0
  for (let i = numWeeks - 1; i >= 0; i--) {
    const w = new Date(currentWeekStart);
    w.setDate(w.getDate() - i * 7);
    weeksMap.set(w.getTime(), 0);
  }

  logs.forEach(l => {
    if (l.completed === false || l.id?.startsWith('temp_skip_')) return;
    const logWeekStart = getWeekStart(l.date).getTime();
    if (weeksMap.has(logWeekStart)) {
      const vol = (l.weight || 0) * (l.reps || 0);
      weeksMap.set(logWeekStart, (weeksMap.get(logWeekStart) || 0) + vol);
    }
  });

  return weeksMap;
}

/**
 * Groups logs/sessions by local date.
 */
export function getDailyVolumeMap(
  logs: LogLike[],
  sessions: SessionLike[]
): Record<string, number> {
  const dailyVol: Record<string, number> = {};
  const sessionDates = new Set<string>();

  sessions.forEach(s => {
    const dateKey = getLocalDatePart(s.date);
    if (!dailyVol[dateKey]) dailyVol[dateKey] = 0;
    dailyVol[dateKey] += s.volume || 0;
    sessionDates.add(dateKey);
  });

  logs.forEach(l => {
    const dateKey = getLocalDatePart(l.date);
    if (sessionDates.has(dateKey)) return;
    if (l.id?.startsWith('temp_') || l.completed === false) return;

    if (!dailyVol[dateKey]) dailyVol[dateKey] = 0;
    dailyVol[dateKey] += (l.weight || 0) * (l.reps || 0);
  });

  return dailyVol;
}
