import { StrengthEstimator } from './StrengthEstimator';

export class BrzyckiEstimator implements StrengthEstimator {
  name = "Formula di Brzycki";
  shortName = "Brzycki";
  reason = "Eccezionalmente accurata per sforzi massimali e sub-massimali a basse ripetizioni (< 5 reps).";

  estimate1RM(weight: number, reps: number): number {
    if (reps <= 1) return weight;
    return weight * (36 / (37 - reps));
  }

  estimateWeightForReps(rm1: number, targetReps: number): number {
    if (targetReps <= 1) return rm1;
    return rm1 * ((37 - targetReps) / 36);
  }
}
