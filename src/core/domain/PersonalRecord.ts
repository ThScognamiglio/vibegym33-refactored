import { Log } from './Log';
import { getLocalDatePart } from '../../date';

export interface PRResult {
  value: number;
  date: string;
  source: 'stored' | 'epley_30d';
  isStale: boolean;
  confidenceScore: number;
}

export class PersonalRecord {
  /**
   * Calcola il Personal Record filtrando anomalie e calcolando la confidence.
   * @param exerciseId L'id dell'esercizio
   * @param allLogs Tutti i log dell'utente per questo esercizio
   * @param stalenessDays Giorni dopo i quali un PR non testato diventa stale
   */
  static getPR(
    exerciseId: string,
    allLogs: Log[],
    stalenessDays: number = 90
  ): PRResult | null {
    const exLogs = allLogs.filter(
      l => l.exerciseId === exerciseId && l.completed !== false && l.weight > 0 && l.reps > 0
    );

    if (exLogs.length === 0) return null;

    // Ordina i log cronologicamente per Historical Validation
    const sortedLogs = [...exLogs].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let runningPR = 0;
    let validMaxWeightLog: Log | null = null;

    // 1. Get Stored PR with Historical Validation
    for (let i = 0; i < sortedLogs.length; i++) {
      const l = sortedLogs[i];

      // Historical Validation: se c'è un salto anomalo (> 25% del PR storico, a basse rep)
      if (runningPR > 0 && l.weight > runningPR * 1.25 && l.reps <= 3) {
        // Look-ahead: controlla se questo salto è stato confermato da log successivi
        // (cioè se in seguito ha sollevato almeno l'80% di questo picco)
        let isConfirmed = false;
        for (let j = i + 1; j < sortedLogs.length; j++) {
          if (sortedLogs[j].weight >= l.weight * 0.80) {
            isConfirmed = true;
            break;
          }
        }

        // Se non è stato mai confermato in futuro, diamo il beneficio del dubbio
        // solo se il log è recentissimo (ultimi 14 giorni). Altrimenti è un typo storico da scartare.
        if (!isConfirmed) {
          const logDate = new Date(l.date);
          const fourteenDaysAgo = new Date();
          fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
          
          if (logDate < fourteenDaysAgo) {
            console.warn(`[PR Engine] Unconfirmed historical spike rejected for ${exerciseId}: ${l.weight}kgx${l.reps}`);
            continue; // Scarta
          }
        }
      }
      
      if (l.weight > runningPR) {
        runningPR = l.weight;
      }

      if (!validMaxWeightLog || l.weight > validMaxWeightLog.weight) {
        validMaxWeightLog = l;
      } else if (l.weight === validMaxWeightLog.weight) {
        if (new Date(l.date) > new Date(validMaxWeightLog.date)) {
          validMaxWeightLog = l;
        }
      }
    }

    if (!validMaxWeightLog) return null;

    const storedPRValue = validMaxWeightLog.weight;
    const storedPRDate = validMaxWeightLog.date;

    // 2. Get Epley 30-day estimate
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const logs30d = exLogs.filter(l => new Date(l.date) >= thirtyDaysAgo);
    let maxEpley30d = 0;
    let maxEpleyLog: Log | null = null;

    logs30d.forEach(l => {
      // Ignora gli outlier anche nel calcolo Epley
      if (runningPR > 0 && l.weight > runningPR * 1.25 && l.reps <= 2) return;

      const epley = l.weight * (1 + 0.0333 * l.reps);
      if (epley > maxEpley30d) {
        maxEpley30d = epley;
        maxEpleyLog = l;
      }
    });

    // 3. Staleness Detection
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - stalenessDays);
    
    let isStale = new Date(storedPRDate) < cutoffDate;
    
    // Se la stima Epley a 30gg supera il PR salvato del 5%, il PR in DB è Stale (Da Rivalutare)
    if (maxEpley30d > storedPRValue * 1.05) {
      isStale = true;
    }

    // 4. Source Hierarchy & Confidence Score
    let confidenceScore = 1.0;
    if (isStale) confidenceScore = 0.5;

    // Se Epley 30d è maggiore del PR effettivo, l'app suggerisce Epley come "Highest Confidence"
    if (maxEpley30d > storedPRValue && maxEpleyLog) {
      return {
        value: Math.round(maxEpley30d * 10) / 10,
        date: getLocalDatePart(maxEpleyLog.date),
        source: 'epley_30d',
        isStale,
        confidenceScore: isStale ? 0.5 : 0.85, // Epley è stimato, quindi confidenza leggermente minore di 1.0
      };
    }

    // Ritorna lo Stored PR
    return {
      value: storedPRValue,
      date: getLocalDatePart(storedPRDate),
      source: 'stored',
      isStale,
      confidenceScore: isStale ? 0.5 : 1.0, // Stored PR recente ha 1.0
    };
  }
}
