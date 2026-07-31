import { describe, it, expect } from 'vitest';
import { calculatePlates, DEFAULT_PLATES, roundToAvailableWeight } from '../core/warmup/plateCalculator';

describe('plateCalculator', () => {
    describe('calculatePlates', () => {
        it('should return empty plates if target weight is less than or equal to barbell weight', () => {
            const result = calculatePlates(20, 20, DEFAULT_PLATES);
            expect(result.platesPerSide).toEqual([]);
            expect(result.totalWeight).toBe(20);
            expect(result.remainder).toBe(0);
            expect(result.achievable).toBe(true);
        });

        it('should correctly calculate exact plates for a standard target', () => {
            // Target: 100kg. Barbell: 20kg. Remaining: 80kg (40kg per side).
            // 40kg per side should be [25, 15] or [20, 20] depending on DEFAULT_PLATES greedy.
            // DEFAULT_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25]
            // Greedy: 40 -> 25, then 15. So [25, 15].
            const result = calculatePlates(100, 20, DEFAULT_PLATES);
            expect(result.platesPerSide).toEqual([25, 15]);
            expect(result.totalWeight).toBe(100);
            expect(result.achievable).toBe(true);
        });

        it('should correctly calculate plates with 20kg plates if 25kg is unavailable', () => {
            // Target: 100kg. Barbell: 20kg. Remaining: 80kg (40kg per side).
            // Available: [20, 15, 10, 5, 2.5, 1.25]
            // Greedy: 40 -> 20, then 20.
            const customPlates = [20, 15, 10, 5, 2.5, 1.25];
            const result = calculatePlates(100, 20, customPlates);
            expect(result.platesPerSide).toEqual([20, 20]);
            expect(result.totalWeight).toBe(100);
            expect(result.achievable).toBe(true);
        });

        it('should handle decimal weights correctly (floating point drift)', () => {
            // Target: 67.5kg. Barbell: 20kg. Remaining: 47.5kg (23.75kg per side)
            // Greedy: 20 -> 2.5 -> 1.25. Total = 23.75
            const result = calculatePlates(67.5, 20, DEFAULT_PLATES);
            expect(result.platesPerSide).toEqual([20, 2.5, 1.25]);
            expect(result.totalWeight).toBe(67.5);
            expect(result.achievable).toBe(true);
        });

        it('should return unachievable if the weight cannot be made exactly', () => {
            // Target: 66kg. Barbell: 20kg. Remaining: 46kg (23kg per side)
            // Min plate is 1.25. We can make 22.5 (20+2.5) or 23.75 (20+2.5+1.25).
            // Greedy: 20 -> 2.5. Remaining 0.5kg cannot be made.
            const result = calculatePlates(66, 20, DEFAULT_PLATES);
            expect(result.achievable).toBe(false);
            expect(result.platesPerSide).toEqual([20, 2.5]);
            expect(result.totalWeight).toBe(65);
            expect(result.remainder).toBe(0.5); // 0.5kg per side short
        });
    });

    describe('roundToAvailableWeight', () => {
        it('should round up/down to nearest available step', () => {
            // With DEFAULT_PLATES min plate is 1.25. Total step is 2.5.
            // Barbell 20. Targets around 60: 60 (exact), 62.5 (exact).
            expect(roundToAvailableWeight(61, 20, DEFAULT_PLATES)).toBe(60); // 61 -> 60
            expect(roundToAvailableWeight(62, 20, DEFAULT_PLATES)).toBe(62.5); // 62 -> 62.5
        });

        it('should not go below barbell weight', () => {
            expect(roundToAvailableWeight(15, 20, DEFAULT_PLATES)).toBe(20);
        });
    });
});
