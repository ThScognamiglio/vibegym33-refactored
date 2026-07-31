import { WarmupSet, WarmupStrategy, WarmupStrategyOptions } from './types';
import { calculatePlates, roundToAvailableWeight, DEFAULT_PLATES } from './plateCalculator';

interface WarmupScheme {
  percentages: number[];    // 0 = empty barbell
  reps: number[];
  labels: string[];
}

function getScheme(workingWeight: number): WarmupScheme {
  if (workingWeight < 60) {
    return {
      percentages: [0,    0.55, 0.85],
      reps:        [15,   8,    2],
      labels:      ['Raise', 'Activate', 'Potentiate'],
    };
  }
  if (workingWeight < 100) {
    return {
      percentages: [0,    0.40, 0.65, 0.85],
      reps:        [15,   10,   5,    2],
      labels:      ['Raise', 'Activate', 'Mobilise', 'Potentiate'],
    };
  }
  if (workingWeight < 150) {
    return {
      percentages: [0,    0.35, 0.55, 0.75, 0.90],
      reps:        [15,   8,   5,    3,    1],
      labels:      ['Raise', 'Activate', 'Mobilise', 'Potentiate', 'Peak'],
    };
  }
  return {
    percentages: [0,    0.30, 0.50, 0.65, 0.80, 0.90],
    reps:        [15,   8,    5,    3,    2,    1],
    labels:      ['Raise', 'Activate', 'Mobilise', 'Potentiate', 'Peak', 'Prime'],
  };
}

export class BarbellStrategy implements WarmupStrategy {
  generate(workingWeight: number, options?: WarmupStrategyOptions): WarmupSet[] {
    const barbellWeight = options?.barbellWeight ?? 20;
    const availablePlates = options?.availablePlates ?? DEFAULT_PLATES;

    // Ensure the barbell is never fully unloaded beyond barbellWeight
    if (workingWeight <= barbellWeight) return [];

    const scheme = getScheme(workingWeight);
    let prevPlates: number[] = [];

    return scheme.percentages.map((pct, i) => {
      const rawWeight = pct === 0
        ? barbellWeight
        : workingWeight * pct;

      const weight = pct === 0
        ? barbellWeight
        : roundToAvailableWeight(rawWeight, barbellWeight, availablePlates);

      const platesResult = calculatePlates(weight, barbellWeight, availablePlates);

      if (!platesResult.achievable) {
        console.warn(`[Warmup Engine] Fallback: Impossibile calcolare i dischi esatti per il carico di ${weight}kg con i piatti disponibili.`, { availablePlates });
        prevPlates = []; // Reset plate tracking for subsequent sets if any
        
        const percentLabel = pct === 0 ? 'Barra' : `${Math.round(pct * 100)}%`;
        return {
          reps: scheme.reps[i],
          weight: Math.round(rawWeight), // Fallback to raw percentage, nearest kg
          rawWeight,
          percentLabel,
          label: scheme.labels[i],
        };
      }

      const currentPlates = platesResult.platesPerSide; // sorted descending

      // Calculate deltas relative to previous set's plates
      const add: number[] = [];
      const remove: number[] = [];

      const currentCopy = [...currentPlates];
      const prevCopy = [...prevPlates];

      // Match common plates between sets so we don't unnecessarily unload them
      for (let j = prevCopy.length - 1; j >= 0; j--) {
        const plate = prevCopy[j];
        const idx = currentCopy.indexOf(plate);
        if (idx !== -1) {
          prevCopy.splice(j, 1);
          currentCopy.splice(idx, 1);
        }
      }

      // Remaining in prevCopy are to be removed from the barbell
      remove.push(...prevCopy);
      // Remaining in currentCopy are to be added to the barbell
      add.push(...currentCopy);

      add.sort((a, b) => b - a);
      remove.sort((a, b) => b - a);

      let deltaMsg = '';
      if (i === 0) {
        deltaMsg = 'Solo bilanciere';
      } else {
        const parts: string[] = [];
        if (remove.length > 0) {
          parts.push(`togli ${remove.join('+')}kg`);
        }
        if (add.length > 0) {
          parts.push(`metti ${add.join('+')}kg`);
        }
        deltaMsg = parts.join(', ');
        if (!deltaMsg) deltaMsg = 'Nessuna modifica';
      }

      prevPlates = currentPlates;

      const percentLabel = pct === 0 ? 'Barra' : `${Math.round(pct * 100)}%`;

      return {
        reps: scheme.reps[i],
        weight,
        rawWeight,
        percentLabel,
        label: scheme.labels[i],
        delta: {
          add,
          remove,
          message: deltaMsg
        }
      };
    });
  }
}
