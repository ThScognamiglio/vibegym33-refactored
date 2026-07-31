import { Log, WorkoutSession } from '../../types';

import { EstimatorFactory } from './estimators';
import { PRResult } from './PersonalRecord';

export interface OverloadSuggestion {
  suggestedWeight: number;
  captionKey: string;
  captionParams?: Record<string, any>;
  formulaName?: string;
  formulaReason?: string;
}

export function getProgressiveStep(currentWeight: number): number {
  if (currentWeight < 10) return 1.0;    // Manubri leggeri / cavi (passo di 1kg)
  if (currentWeight < 25) return 2.0;    // Manubri medi (passo di 2kg)
  if (currentWeight < 50) return 2.5;    // Bilanciere medio (dischi da 1.25kg)
  return 5.0;                            // Carichi pesanti (dischi da 2.5kg o Leg Press)
}

export function getOverloadSuggestion(
  lastLogs: Log[],
  targetReps: number,
  storedPR?: PRResult | null,
  options?: {
    isBodyweight?: boolean;
    groupId?: string;
  }
): OverloadSuggestion | null {
  const completedLogs = lastLogs.filter(l => l.completed !== false);
  if (!completedLogs.length) return null;

  const maxReps = Math.max(...completedLogs.map(l => l.reps));
  const avgRpe = completedLogs.reduce((s, l) => s + (l.rpe ?? 7), 0) / completedLogs.length;
  const maxWeightSet = completedLogs.reduce((prev, current) => (prev.weight > current.weight) ? prev : current);
  const currentWeight = maxWeightSet.weight;

  // Se l'RPE è >= 9, suggeriamo di consolidare prima di progressare
  if (avgRpe >= 9) {
    return null; // Consolidate
  }

  // --- CALISTHENICS LOGIC ---
  if (options?.isBodyweight) {
    let groupThreshold = 15; // default fallback
    const groupId = options.groupId?.toLowerCase() || '';
    
    // Hypertrophy Caps
    if (['back', 'biceps', 'traps'].includes(groupId)) groupThreshold = 12; // Pulling
    else if (['chest', 'shoulders', 'triceps'].includes(groupId)) groupThreshold = 20; // Pushing
    else if (['quads', 'glutes', 'hamstrings', 'calves'].includes(groupId)) groupThreshold = 15; // Legs

    if (maxReps >= targetReps) {
      const step = 2.5; // Zavorra default step is 2.5kg
      if (maxReps >= groupThreshold || currentWeight > 0) {
        return {
          suggestedWeight: currentWeight + step,
          captionKey: 'ai_coach_calisthenics_weight_only',
          captionParams: { step }
        };
      } else {
        return {
          suggestedWeight: currentWeight + step,
          captionKey: 'ai_coach_calisthenics_reps_weight',
          captionParams: { step }
        };
      }
    }
    return null; // State 1: < targetReps
  }

  // --- STANDARD WEIGHT LOGIC (Deterministic Scenarios) ---
  if (currentWeight > 0) {
    const step = getProgressiveStep(currentWeight);

    if (!storedPR || storedPR.value <= 0) {
      // Fallback: nessun PR
      if (maxReps >= targetReps && avgRpe <= 8) {
        return {
          suggestedWeight: currentWeight + step,
          captionKey: 'ai_coach_no_pr'
        };
      }
      return null;
    }

    // Scelta automatica della formula in base alle rep target!
    const estimator = EstimatorFactory.getBestEstimator(targetReps);
    const targetWeight = estimator.estimateWeightForReps(storedPR.value, targetReps);

    // Scenario C: Over-Performance
    if (currentWeight > targetWeight * 1.05) {
      return {
        suggestedWeight: currentWeight + step,
        captionKey: 'ai_coach_overperformance',
        captionParams: { target: targetWeight.toFixed(1), step },
        formulaName: estimator.shortName,
        formulaReason: estimator.reason
      };
    }

    // Scenario A: Under-Training
    if (currentWeight < targetWeight * 0.90) {
      return {
        suggestedWeight: currentWeight + step,
        captionKey: 'ai_coach_undertraining',
        captionParams: { target: targetWeight.toFixed(1), step },
        formulaName: estimator.shortName,
        formulaReason: estimator.reason
      };
    }

    // Scenario B1/B2: Optimal Zone (90% - 105%)
    if (avgRpe < 6) {
      return {
        suggestedWeight: currentWeight + step,
        captionKey: 'ai_coach_optimal_low_rpe',
        captionParams: { rpe: avgRpe.toFixed(1), step },
        formulaName: estimator.shortName,
        formulaReason: estimator.reason
      };
    } else if (avgRpe <= 8 && maxReps >= targetReps) {
      return {
        suggestedWeight: currentWeight + step,
        captionKey: 'ai_coach_optimal_good',
        captionParams: { rpe: avgRpe.toFixed(1), step },
        formulaName: estimator.shortName,
        formulaReason: estimator.reason
      };
    }
  }

  return null;
}

// ─── INTERNAL WORKLOAD (sRPE - Metodo Foster) ────────────────────────────────

export interface SRPEResult {
  labelKey: string;
  color: string;
  descriptionKey: string;
}

export function calculateSRPE(session: WorkoutSession): number {
    return (session.durationMinutes || 0) * parseFloat(session.avgRpe || '0');
}

export function getSRPELabel(srpe: number): SRPEResult {
  if (srpe < 150) return { labelKey: 'srpe_recovery', color: 'text-green-500 bg-green-500', descriptionKey: 'srpe_recovery_desc' };
  if (srpe < 300) return { labelKey: 'srpe_moderate', color: 'text-cyan-500 bg-cyan-500', descriptionKey: 'srpe_moderate_desc' };
  if (srpe < 450) return { labelKey: 'srpe_hard', color: 'text-orange-500 bg-orange-500', descriptionKey: 'srpe_hard_desc' };
  if (srpe < 600) return { labelKey: 'srpe_very_hard', color: 'text-red-500 bg-red-500', descriptionKey: 'srpe_very_hard_desc' };
  return { labelKey: 'srpe_danger', color: 'text-red-900 bg-red-900', descriptionKey: 'srpe_danger_desc' };
}

// ─── STRENGTH LEVELS (NSCA STANDARDS) ────────────────────────────────────────

export type NSCACategory = 'Pettorali (Spinta)' | 'Gambe (Accosciata)' | 'Gambe (Hinge)' | 'Spalle' | 'Dorso (Tirata)';

export interface StrengthResult {
  categoryName: NSCACategory;
  level: 'Novellino' | 'Beginner' | 'Novice' | 'Intermediate' | 'Advanced' | 'Elite';
  ratio: number;
  nextThreshold: number | null;
  ratioProgress: number; // 0 to 100
  isMachine: boolean;
  exerciseName?: string;
  rmUsed?: number;
}

// Multipli del peso corporeo (Uomini) standard NSCA + ExRx
const NSCA_THRESHOLDS: Record<NSCACategory, { levels: string[], values: number[] }> = {
  'Pettorali (Spinta)': {
    levels: ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'],
    values: [0.50, 0.75, 1.00, 1.25, 1.50]
  },
  'Gambe (Accosciata)': { // Squat / Leg Press
    levels: ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'],
    values: [0.75, 1.25, 1.50, 1.75, 2.00]
  },
  'Gambe (Hinge)': { // Stacco da terra (è Gambe, ma pesi maggiori)
    levels: ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'],
    values: [1.00, 1.50, 1.75, 2.00, 2.50]
  },
  'Spalle': { // OHP
    levels: ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'],
    values: [0.35, 0.50, 0.65, 0.80, 1.00]
  },
  'Dorso (Tirata)': { // Rematore
    levels: ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'],
    values: [0.50, 0.75, 1.00, 1.25, 1.50]
  }
};

const KEYWORD_MAP: { category: NSCACategory, keywords: string[] }[] = [
  { category: 'Pettorali (Spinta)', keywords: ['panca', 'bench', 'chest', 'spinte', 'croci', 'pectoral'] },
  { category: 'Gambe (Hinge)', keywords: ['stacco', 'deadlift', 'stacchi', 'hip thrust'] }, 
  { category: 'Gambe (Accosciata)', keywords: ['squat', 'accosciata', 'leg press', 'pressa', 'leg extension', 'hack', 'affondi', 'lunge'] },
  { category: 'Spalle', keywords: ['military', 'ohp', 'lento', 'shoulder', 'deltoidi', 'alzate'] },
  { category: 'Dorso (Tirata)', keywords: ['rematore', 'row', 'pulley', 't-bar', 'dorso', 'lat machine', 'lat pulldown'] }
];

export function getStrengthLevel(rm1: number, bodyweight: number, exercise: { name: string, nscaCategory?: string }): StrengthResult | null {
  if (!bodyweight || bodyweight <= 0) return null;
  
  // Usa ESCLUSIVAMENTE la categoria impostata esplicitamente dal PT con il badge.
  // Ignora completamente il nome dell'esercizio per evitare accavallamenti.
  if (!exercise.nscaCategory) return null;

  const targetCategory = exercise.nscaCategory as NSCACategory;

  // Rileva se è una macchina per mostrare il flag ⚠️ nella UI
  const exNameLower = exercise.name.toLowerCase();
  const isMachine = exNameLower.includes('machine') || exNameLower.includes('macchina') ||
                    exNameLower.includes('pressa') || exNameLower.includes('cavi') ||
                    exNameLower.includes('pulley') || exNameLower.includes('pectoral');

  const ratio = rm1 / bodyweight;
  const thresholds = NSCA_THRESHOLDS[targetCategory];
  
  let levelIndex = -1;
  for (let i = thresholds.values.length - 1; i >= 0; i--) {
    if (ratio >= thresholds.values[i]) {
      levelIndex = i;
      break;
    }
  }

  if (levelIndex === -1) {
    return {
      categoryName: targetCategory,
      level: 'Novellino',
      ratio,
      nextThreshold: thresholds.values[0],
      ratioProgress: 0, // Global progress starts at 0 for Novellino
      isMachine,
      exerciseName: exercise.name,
      rmUsed: rm1
    };
  }

  const currentLevel = thresholds.levels[levelIndex] as StrengthResult['level'];
  const nextVal = levelIndex < thresholds.values.length - 1 ? thresholds.values[levelIndex + 1] : null;
  
  let progress = 100;
  let globalProgress = 100;

  if (nextVal) {
      const currentVal = thresholds.values[levelIndex];
      progress = ((ratio - currentVal) / (nextVal - currentVal)) * 100;
      globalProgress = ((levelIndex + (progress / 100)) / (thresholds.values.length - 1)) * 100;
  } else if (levelIndex === -1) {
      // Novellino: progressiamo verso il primo step (Beginner)
      const firstVal = thresholds.values[0];
      progress = (ratio / firstVal) * 100;
      globalProgress = 0; // O si potrebbe fare un pezzettino visuale prima del Beg
  }

  return {
    categoryName: targetCategory,
    level: currentLevel,
    ratio,
    nextThreshold: nextVal,
    ratioProgress: Math.min(100, Math.max(0, globalProgress)),
    isMachine,
    exerciseName: exercise.name,
    rmUsed: rm1
  };
}

// ─── PR STALENESS DETECTION ──────────────────────────────────────────────────

export interface PRStalenessResult {
  isStale: boolean;
  confidenceScore: 'HIGH' | 'MEDIUM' | 'LOW';
  suggestion: string | null;
}

/**
 * Detects if a stored 1RM (PR) is stale based on recent performance.
 * If the recent Epley estimate exceeds the stored PR by 5% or more,
 * the stored PR is considered stale (confidence drops) and a test is suggested.
 * 
 * @param storedPR The currently saved 1RM in the database
 * @param recentEpleyEstimate The 1RM estimated from logs of the last 30 days
 */
export function detectPRStaleness(storedPR: number, recentEpleyEstimate: number): PRStalenessResult {
  if (storedPR <= 0) {
    return { isStale: false, confidenceScore: 'LOW', suggestion: 'Nessun PR registrato. Esegui un test di massimale.' };
  }

  // If recent performance suggests a 1RM that is 5% greater than the stored PR
  if (recentEpleyEstimate > storedPR * 1.05) {
    return {
      isStale: true,
      confidenceScore: 'LOW',
      suggestion: `Le tue recenti performance suggeriscono un massimale stimato di ${recentEpleyEstimate.toFixed(1)}kg. Il tuo PR attuale (${storedPR}kg) è obsoleto. Ti consigliamo di testare il nuovo massimale!`
    };
  }
  
  // If recent performance is very low compared to PR (maybe injury or detraining)
  if (recentEpleyEstimate > 0 && recentEpleyEstimate < storedPR * 0.8) {
     return {
      isStale: true,
      confidenceScore: 'MEDIUM',
      suggestion: `Attenzione: le performance recenti (${recentEpleyEstimate.toFixed(1)}kg) sono molto inferiori al tuo PR (${storedPR}kg). Valuta un periodo di scarico o un reset del PR.`
    };
  }

  return {
    isStale: false,
    confidenceScore: 'HIGH',
    suggestion: null
  };
}
