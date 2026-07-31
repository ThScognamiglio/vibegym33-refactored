import { StrengthEstimator } from './StrengthEstimator';

export class LombardiEstimator implements StrengthEstimator {
  name = "Formula di Lombardi";
  shortName = "Lombardi";
  reason = "Molto adatta per lavori ipertrofici e di resistenza ad alte ripetizioni (> 10 reps), in quanto scala in modo non lineare per la fatica prolungata.";

  estimate1RM(weight: number, reps: number): number {
    if (reps <= 1) return weight;
    return weight * Math.pow(reps, 0.10);
  }

  estimateWeightForReps(rm1: number, targetReps: number): number {
    if (targetReps <= 1) return rm1;
    return rm1 / Math.pow(targetReps, 0.10);
  }
}
