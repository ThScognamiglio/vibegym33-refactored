// ─── PLATE CALCULATOR ─────────────────────────────────────────────────────────
// Logica pura — zero dipendenze React.
// Calcola i dischi da mettere PER LATO sul bilanciere dato un peso target.

export const DEFAULT_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

export const PLATE_COLORS: Record<number, string> = {
  25:   '#dc2626', // rosso
  20:   '#2563eb', // blu
  15:   '#ca8a04', // giallo
  10:   '#16a34a', // verde
  5:    '#6b7280', // grigio
  2.5:  '#111827', // nero
  1.25: '#9ca3af', // argento
};

export const BARBELL_OPTIONS = [
  { label: 'Olimpico', weight: 20 },
  { label: 'Donna',    weight: 15 },
  { label: 'Corto',    weight: 10 },
  { label: 'EZ/Curl',  weight: 8  },
  { label: 'Trap Bar (Hex)', weight: 25 },
  { label: 'Multipower', weight: 11 },
  { label: 'Nessuno / Macchina', weight: 0 },
];

export interface PlateResult {
  platesPerSide: number[];   // es. [20, 10, 2.5] per lato
  totalWeight: number;       // peso effettivamente raggiunto
  remainder: number;         // differenza dal target (0 = esatto)
  achievable: boolean;       // true se il target è raggiungibile esattamente
}

/**
 * Calcola i dischi da mettere per lato sul bilanciere.
 * @param targetWeight   Peso totale desiderato (incluso bilanciere)
 * @param barbellWeight  Peso del bilanciere (default 20kg olimpico)
 * @param availablePlates Lista dei dischi disponibili (default tutti)
 */
export function calculatePlates(
  targetWeight: number,
  barbellWeight: number = 20,
  availablePlates: number[] = DEFAULT_PLATES
): PlateResult {
  const weightPerSide = (targetWeight - barbellWeight) / 2;

  if (weightPerSide <= 0) {
    return { platesPerSide: [], totalWeight: barbellWeight, remainder: targetWeight - barbellWeight, achievable: targetWeight === barbellWeight };
  }

  // Ordina i dischi dal più pesante al più leggero (greedy)
  const sortedPlates = [...availablePlates].sort((a, b) => b - a);

  const platesPerSide: number[] = [];
  let remaining = weightPerSide;

  for (const plate of sortedPlates) {
    while (remaining >= plate - 0.001) {  // tolleranza floating point
      platesPerSide.push(plate);
      remaining -= plate;
      remaining = Math.round(remaining * 1000) / 1000; // evita floating point drift
    }
  }

  const totalWeight = barbellWeight + platesPerSide.reduce((s, p) => s + p, 0) * 2;
  const remainder = Math.round((weightPerSide - platesPerSide.reduce((s, p) => s + p, 0)) * 1000) / 1000;

  return {
    platesPerSide,
    totalWeight,
    remainder,
    achievable: Math.abs(remainder) < 0.01
  };
}

/**
 * Arrotonda un peso al valore più vicino raggiungibile coi dischi disponibili
 * (bilanciere + multipli di 2 * disco_minimo).
 */
export function roundToAvailableWeight(
  targetWeight: number,
  barbellWeight: number = 20,
  availablePlates: number[] = DEFAULT_PLATES
): number {
  if (targetWeight <= barbellWeight) return barbellWeight;

  const minPlate = Math.min(...availablePlates);
  const step = minPlate * 2; // i dischi si aggiungono in coppia (un lato = l'altro)

  const weightAboveBar = targetWeight - barbellWeight;
  const rounded = Math.round(weightAboveBar / step) * step;

  return barbellWeight + Math.max(0, rounded);
}
