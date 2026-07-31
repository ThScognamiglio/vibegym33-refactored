import { WarmupSet, WarmupStrategy, WarmupStrategyOptions } from './types';

interface DumbbellScheme {
  percentages: number[];
  reps: number[];
  labels: string[];
}

function getDumbbellScheme(workingWeight: number): DumbbellScheme {
  if (workingWeight < 20) {
    return {
      percentages: [0.40, 0.70, 0.90],
      reps:        [10,   6,    2],
      labels:      ['Raise', 'Activate', 'Potentiate'],
    };
  }
  if (workingWeight < 40) {
    return {
      percentages: [0.40, 0.60, 0.80, 0.90],
      reps:        [10,   8,    4,    1],
      labels:      ['Raise', 'Activate', 'Mobilise', 'Potentiate'],
    };
  }
  return {
    percentages: [0.35, 0.55, 0.75, 0.85, 0.90],
    reps:        [12,   8,    5,    2,    1],
    labels:      ['Raise', 'Activate', 'Mobilise', 'Potentiate', 'Peak'],
  };
}

export function roundToNearestDumbbell(weight: number): number {
  if (weight < 10) {
    return Math.max(1, Math.round(weight));
  }
  if (weight < 30) {
    return Math.max(10, Math.round(weight / 2) * 2);
  }
  return Math.max(30, Math.round(weight / 2.5) * 2.5);
}

export class DumbbellStrategy implements WarmupStrategy {
  generate(workingWeight: number, options?: WarmupStrategyOptions): WarmupSet[] {
    // If working weight is extremely low, no warmups needed
    if (workingWeight <= 4) return [];

    const scheme = getDumbbellScheme(workingWeight);

    return scheme.percentages.map((pct, i) => {
      const rawWeight = workingWeight * pct;
      const weight = roundToNearestDumbbell(rawWeight);
      const percentLabel = `${Math.round(pct * 100)}%`;

      return {
        reps: scheme.reps[i],
        weight,
        rawWeight,
        percentLabel,
        label: scheme.labels[i],
      };
    });
  }
}
