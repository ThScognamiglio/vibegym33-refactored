export interface StrengthEstimator {
  name: string;
  shortName: string;
  reason: string;
  
  /**
   * Stima il massimale 1RM dato un peso e un numero di ripetizioni.
   */
  estimate1RM(weight: number, reps: number): number;

  /**
   * Calcola il peso teorico da sollevare per un dato target di ripetizioni,
   * conoscendo il massimale (1RM) dell'atleta.
   * (Formula Inversa)
   */
  estimateWeightForReps(rm1: number, targetReps: number): number;
}
