import { WarmupSet, WarmupStrategy, WarmupStrategyOptions } from './types';
import { BarbellStrategy } from './BarbellStrategy';
import { DumbbellStrategy } from './DumbbellStrategy';
import { MachineStrategy } from './MachineStrategy';

export * from './types';
export * from './BarbellStrategy';
export * from './DumbbellStrategy';
export * from './MachineStrategy';

export function getWarmupStrategy(equipment?: string): WarmupStrategy {
  const eq = (equipment || '').toLowerCase().trim();
  
  if (eq.includes('bilanciere') || eq.includes('barbell')) {
    return new BarbellStrategy();
  }
  if (eq.includes('manubri') || eq.includes('dumbbell')) {
    return new DumbbellStrategy();
  }
  if (
    eq.includes('macchina') || 
    eq.includes('machine') || 
    eq.includes('cavi') || 
    eq.includes('cable') ||
    eq.includes('multipower') ||
    eq.includes('smith') ||
    eq.includes('press')
  ) {
    return new MachineStrategy();
  }

  // Default fallback is Barbell
  return new BarbellStrategy();
}

export function generateWarmupSets(
  equipment: string | undefined,
  workingWeight: number,
  options?: WarmupStrategyOptions
): WarmupSet[] {
  const strategy = getWarmupStrategy(equipment);
  return strategy.generate(workingWeight, options);
}
