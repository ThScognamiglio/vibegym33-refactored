import { Log as ILog } from '../../types';
import { Exercise } from './Exercise';

export function resolveBodyweight(
  bodyweightAtLog: number | undefined | null,
  userWeight?: number,
  measurements?: { weight: number }[],
  defaultWeight: number = 75
): number {
  if (bodyweightAtLog && bodyweightAtLog > 0) {
    return bodyweightAtLog;
  }
  if (userWeight && userWeight > 0) {
    return userWeight;
  }
  if (measurements && measurements.length > 0) {
    const valid = measurements.filter(m => m.weight && m.weight > 0);
    if (valid.length > 0) {
      return valid[0].weight; // Assume sorted by date desc
    }
  }
  return defaultWeight;
}

export class Log implements ILog {
  id: string;
  userId: string;
  workoutId: string;
  itemId: string;
  exerciseId: string;
  date: string;
  seriesNo: number;
  reps: number;
  weight: number;
  completed: boolean;
  rpe?: number;
  note?: string;
  bodyweightAtLog?: number;

  constructor(raw: ILog) {
    this.id = raw.id;
    this.userId = raw.userId;
    this.workoutId = raw.workoutId;
    this.itemId = raw.itemId;
    this.exerciseId = raw.exerciseId;
    this.date = raw.date;
    this.seriesNo = raw.seriesNo;
    this.reps = raw.reps;
    this.weight = raw.weight;
    this.completed = raw.completed;
    this.rpe = raw.rpe;
    this.note = raw.note;
    this.bodyweightAtLog = raw.bodyweightAtLog;
  }

  calculateVolume(exercise: { isBodyweight: boolean; isUnilateral?: boolean }, resolvedBodyweight: number): number {
    if (this.completed === false) return 0;
    
    let load = this.weight;
    if (exercise.isBodyweight) {
      load = resolvedBodyweight + this.weight; // weight is zavorra
    }

    const multiplier = exercise.isUnilateral ? 2 : 1;
    return load * multiplier * this.reps;
  }
}
