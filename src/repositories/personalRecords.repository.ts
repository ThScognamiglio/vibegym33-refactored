import { collection, doc, getDoc, getDocs, setDoc, query, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase.config';
import { PRResult } from '../core/domain/PersonalRecord';

export const PersonalRecordsRepository = {
  /**
   * Recupera tutti i PR calcolati per l'utente.
   */
  getUserPRs: async (userId: string): Promise<Record<string, PRResult>> => {
    if (!db) throw new Error('[PersonalRecordsRepository] Firestore non inizializzato.');
    
    const snap = await getDocs(collection(db, `users/${userId}/personalRecords`));
    const prs: Record<string, PRResult> = {};
    
    snap.forEach(d => {
      const data = d.data();
      prs[d.id] = {
        value: data.value,
        date: data.date,
        source: data.source,
        isStale: data.isStale,
        confidenceScore: data.confidenceScore,
      };
    });
    
    return prs;
  },

  /**
   * Recupera il PR salvato per uno specifico esercizio.
   */
  getExercisePR: async (userId: string, exerciseId: string): Promise<PRResult | null> => {
    if (!db) throw new Error('[PersonalRecordsRepository] Firestore non inizializzato.');
    
    const docRef = doc(db, `users/${userId}/personalRecords/${exerciseId}`);
    const snap = await getDoc(docRef);
    
    if (!snap.exists()) return null;
    
    const data = snap.data();
    return {
      value: data.value,
      date: data.date,
      source: data.source,
      isStale: data.isStale,
      confidenceScore: data.confidenceScore,
    };
  },

  /**
   * Salva o aggiorna il PR calcolato in Firestore.
   */
  upsertPR: async (userId: string, exerciseId: string, prData: PRResult): Promise<void> => {
    if (!db) throw new Error('[PersonalRecordsRepository] Firestore non inizializzato.');
    
    const docRef = doc(db, `users/${userId}/personalRecords/${exerciseId}`);
    await setDoc(docRef, {
      ...prData,
      lastUpdated: serverTimestamp(),
    }, { merge: true });
  }
};
