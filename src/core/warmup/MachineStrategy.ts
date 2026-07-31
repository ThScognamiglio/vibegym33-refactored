import { WarmupSet, WarmupStrategy, WarmupStrategyOptions } from './types';

interface MachineScheme {
  percentages: number[];
  reps: number[];
  labels: string[];
}

function getMachineScheme(workingWeight: number): MachineScheme {
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

export class MachineStrategy implements WarmupStrategy {
  generate(workingWeight: number, options?: WarmupStrategyOptions): WarmupSet[] {
    const increment = options?.machineIncrement ?? 5;

    // If working weight is extremely low, no warmups needed
    if (workingWeight <= increment) return [];

    const scheme = getMachineScheme(workingWeight);

    return scheme.percentages.map((pct, i) => {
      const rawWeight = workingWeight * pct;
      const weight = Math.max(increment, Math.round(rawWeight / increment) * increment);
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
