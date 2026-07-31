import { WorkoutItem } from '../../types';

// --- CONFIG ---
export const SUPERSET_CONFIG = {
  TRANSITION_MS: 1800,
  GROUPS: ['A', 'B', 'C'] as const,
};

// --- TYPES ---
export type SupersetAction = 'NEXT_EXERCISE' | 'LOOP_BACK' | 'START_REST' | 'NORMAL';

export interface SupersetResult {
  action: SupersetAction;
  nextIndex?: number; // index to jump to (for LOOP_BACK or NEXT_EXERCISE)
}

// --- CORE LOGIC ---

/**
 * @deprecated V2: La SupersetCard gestisce internamente la navigazione.
 * Mantenuta per retrocompatibilità e non più chiamata nel logger.
 */
export function calculateSupersetAction(
  items: WorkoutItem[],
  activeIndex: number,
  currentSetNo: number,
  targetSets: number
): SupersetResult {
  const current = items[activeIndex];
  if (!current?.supersetGroup) return { action: 'NORMAL' };
  const group = current.supersetGroup;
  const nextItem = items[activeIndex + 1];
  if (nextItem?.supersetGroup === group) return { action: 'NEXT_EXERCISE', nextIndex: activeIndex + 1 };
  if (currentSetNo < targetSets) {
    const firstIndex = getFirstIndexOfGroup(items, group);
    return { action: 'LOOP_BACK', nextIndex: firstIndex };
  }
  return { action: 'START_REST', nextIndex: activeIndex + 1 < items.length ? activeIndex + 1 : undefined };
}

/**
 * Find the first item index that belongs to a given superset group.
 */
export function getFirstIndexOfGroup(items: WorkoutItem[], group: string): number {
  return items.findIndex(item => item.supersetGroup === group);
}

/**
 * Returns Tailwind color classes for a given superset group.
 */
export function getGroupColor(group: string | undefined | null): {
  border: string;
  bg: string;
  text: string;
  badge: string;
} {
  switch (group) {
    case 'A':
      return { border: 'border-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-500', badge: 'bg-purple-500 text-white' };
    case 'B':
      return { border: 'border-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-500', badge: 'bg-blue-500 text-white' };
    case 'C':
      return { border: 'border-orange-500', bg: 'bg-orange-500/10', text: 'text-orange-500', badge: 'bg-orange-500 text-white' };
    default:
      return { border: 'border-gray-200 dark:border-gray-700', bg: '', text: 'text-gray-400', badge: 'bg-gray-400 text-white' };
  }
}

/**
 * Cycles through superset groups: null → A → B → C → null
 */
export function cycleGroup(current: string | undefined | null): string | undefined {
  if (!current) return 'A';
  const idx = SUPERSET_CONFIG.GROUPS.indexOf(current as any);
  if (idx === -1 || idx === SUPERSET_CONFIG.GROUPS.length - 1) return undefined;
  return SUPERSET_CONFIG.GROUPS[idx + 1];
}

/**
 * Validates that each superset group in the plan has at least 2 exercises.
 * Returns an array of group names that are invalid (empty = valid).
 */
export function validateSupersetGroups(items: { supersetGroup?: string }[]): string[] {
  const groupCounts: Record<string, number> = {};
  for (const item of items) {
    if (item.supersetGroup) {
      groupCounts[item.supersetGroup] = (groupCounts[item.supersetGroup] ?? 0) + 1;
    }
  }
  return Object.entries(groupCounts)
    .filter(([, count]) => count < 2)
    .map(([group]) => group);
}
