export interface WarmupSet {
  reps: number;
  weight: number;           // Rounded weight
  rawWeight: number;        // Theoretical percentage weight
  percentLabel: string;     // e.g., "55%", "Barra"
  label: string;            // e.g., "Raise", "Activate", "Mobilise", "Potentiate"
  delta?: {
    add: number[];
    remove: number[];
    message: string;
  };
}

export interface WarmupStrategyOptions {
  barbellWeight?: number;
  availablePlates?: number[];
  machineIncrement?: number;
}

export interface WarmupStrategy {
  generate(workingWeight: number, options?: WarmupStrategyOptions): WarmupSet[];
}
