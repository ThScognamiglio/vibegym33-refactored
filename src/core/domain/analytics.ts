export function calculate1RMEpley(weight: number, reps: number): number {
    if (weight <= 0 || reps <= 0) return 0;
    return weight * (1 + 0.0333 * reps);
}

export function calculateEstRPE(weight: number, reps: number, oneRepMax: number): number {
    if (!oneRepMax || oneRepMax <= 0 || weight <= 0) return 5; // Default average effort
    
    // RPE is based on how close you are to failure.
    // Inverse Epley to find max possible reps at that weight:
    // MaxReps = (oneRepMax / weight - 1) / 0.0333
    const maxReps = (oneRepMax / weight - 1) / 0.0333;
    
    // RPE = 10 - Reps in Reserve
    // Reps in Reserve = MaxReps - ActualReps
    let rpe = 10 - (maxReps - reps);
    
    // Clamp between 1 and 10
    if (rpe > 10) rpe = 10;
    if (rpe < 1) rpe = 1;
    
    // Handle edge cases where math goes wild
    if (isNaN(rpe)) return 5;
    
    return Math.round(rpe * 10) / 10;
}
