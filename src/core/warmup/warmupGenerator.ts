// ─── WARM-UP RAMP GENERATOR ───────────────────────────────────────────────────
// Metodo RAMP (Raise, Activate, Mobilise, Potentiate)
// Il numero di serie scala in base al peso di lavoro per una preparazione
// neurale ottimale senza accumulo di fatica prematura.
// Logica pura — zero dipendenze React.

import { roundToAvailableWeight, DEFAULT_PLATES } from './plateCalculator';

export interface WarmupSet {
  reps: number;
  weight: number;           // peso arrotondato ai dischi disponibili
  rawWeight: number;        // peso percentuale teorico (non arrotondato)
  percentLabel: string;     // es. "55%", "Barra"
  label: string;            // es. "Attivazione", "Potentiazione"
}

interface WarmupScheme {
  percentages: number[];    // 0 = bilanciere vuoto
  reps: number[];
  labels: string[];
}

/**
 * Restituisce lo schema RAMP corretto in base al peso di lavoro.
 * Più il carico è alto, più serie servono per preparare il SNC.
 */
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
      reps:        [15,   8,    5,    3,    1],
      labels:      ['Raise', 'Activate', 'Mobilise', 'Potentiate', 'Peak'],
    };
  }
  // >150kg: 6 serie per preparazione massimale
  return {
    percentages: [0,    0.30, 0.50, 0.65, 0.80, 0.90],
    reps:        [15,   8,    5,    3,    2,    1],
    labels:      ['Raise', 'Activate', 'Mobilise', 'Potentiate', 'Peak', 'Prime'],
  };
}

/**
 * Genera le serie di riscaldamento RAMP adattive.
 * @param workingWeight  Peso del primo set di lavoro (es. 100kg)
 * @param barbellWeight  Peso del bilanciere (default 20kg)
 * @param availablePlates Dischi disponibili in palestra
 */
export function generateWarmup(
  workingWeight: number,
  barbellWeight: number = 20,
  availablePlates: number[] = DEFAULT_PLATES
): WarmupSet[] {
  if (workingWeight <= barbellWeight) return [];

  const scheme = getScheme(workingWeight);

  return scheme.percentages.map((pct, i) => {
    const rawWeight = pct === 0
      ? barbellWeight
      : workingWeight * pct;

    const weight = pct === 0
      ? barbellWeight
      : roundToAvailableWeight(rawWeight, barbellWeight, availablePlates);

    const percentLabel = pct === 0 ? 'Barra' : `${Math.round(pct * 100)}%`;

    return {
      reps: scheme.reps[i],
      weight,
      rawWeight,
      percentLabel,
      label: scheme.labels[i],
    };
  });
}

/**
 * Decide se il Warm-Up Generator deve mostrarsi automaticamente.
 * Solo per esercizi compound con carico significativo alla prima serie.
 */
export function shouldShowWarmup(
  lastWeight: number,
  isCompound: boolean,
  setsLoggedSoFar: number
): boolean {
  return isCompound && lastWeight >= 30 && setsLoggedSoFar === 0;
}
