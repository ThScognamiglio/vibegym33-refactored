import { WorkoutItem as IWorkoutItem } from '../../types';

export class WorkoutItem implements IWorkoutItem {
  id: string;
  workoutId: string;
  exerciseId: string;
  dayIndex: number;
  sets: number;
  reps: number;
  restSeconds: number;
  orderIndex: number;
  supersetGroup?: string;

  constructor(raw: IWorkoutItem) {
    this.id = raw.id;
    this.workoutId = raw.workoutId;
    this.exerciseId = raw.exerciseId;
    this.dayIndex = raw.dayIndex;
    this.sets = raw.sets;
    this.reps = raw.reps;
    this.restSeconds = raw.restSeconds;
    this.orderIndex = raw.orderIndex;
    this.supersetGroup = raw.supersetGroup;
  }
}
