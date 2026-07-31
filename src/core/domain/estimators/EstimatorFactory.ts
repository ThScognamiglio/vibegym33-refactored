import { StrengthEstimator } from './StrengthEstimator';
import { BrzyckiEstimator } from './BrzyckiEstimator';
import { EpleyEstimator } from './EpleyEstimator';
import { LombardiEstimator } from './LombardiEstimator';

export class EstimatorFactory {
  /**
   * Seleziona automaticamente la formula matematica migliore in base 
   * al range di ripetizioni target (o eseguite).
   */
  static getBestEstimator(reps: number): StrengthEstimator {
    if (reps < 5) {
      return new BrzyckiEstimator();
    } else if (reps <= 10) {
      return new EpleyEstimator();
    } else {
      return new LombardiEstimator();
    }
  }

  static getEpley(): StrengthEstimator {
    return new EpleyEstimator();
  }
}
