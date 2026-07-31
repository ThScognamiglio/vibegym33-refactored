import { StrengthEstimator } from './StrengthEstimator';

export class EpleyEstimator implements StrengthEstimator {
  name = "Formula di Epley";
  shortName = "Epley";
  reason = "Ideale e molto precisa per un range di ripetizioni moderato (5-10 reps). È il gold standard per la pesistica generale.";

  estimate1RM(weight: number, reps: number): number {
    if (reps <= 1) return weight;
    return weight * (1 + reps / 30);
  }

  estimateWeightForReps(rm1: number, targetReps: number): number {
    if (targetReps <= 1) return rm1;
    return rm1 / (1 + targetReps / 30);
  }
}
