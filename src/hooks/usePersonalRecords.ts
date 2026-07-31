import { useQuery } from '@tanstack/react-query';
import { PersonalRecordsRepository } from '../repositories';

export const usePersonalRecords = (userId: string | undefined) => {
  return useQuery({
    queryKey: ['personalRecords', userId],
    queryFn: async () => {
      if (!userId) return {};
      return await PersonalRecordsRepository.getUserPRs(userId);
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minuti
  });
};

export const useExercisePR = (userId: string | undefined, exerciseId: string | undefined) => {
  return useQuery({
    queryKey: ['personalRecord', userId, exerciseId],
    queryFn: async () => {
      if (!userId || !exerciseId) return null;
      return await PersonalRecordsRepository.getExercisePR(userId, exerciseId);
    },
    enabled: !!userId && !!exerciseId,
    staleTime: 5 * 60 * 1000,
  });
};

import { useEffect } from 'react';
import { LogsRepository } from '../repositories/logs.repository';
import { PersonalRecord } from '../core/domain/PersonalRecord';

/**
 * Hook to silenty migrate/recalculate all PRs on first load if the PR collection is empty.
 * In a real app, this would be a Cloud Function or triggered by a 'prMigrated' flag on the user doc.
 */
export const useMigratePRs = (userId: string | undefined) => {
  const { data: prs, isLoading } = usePersonalRecords(userId);

  useEffect(() => {
    if (!userId || isLoading) return;

    // Se non ci sono PR salvati, ma l'utente potrebbe avere uno storico, eseguiamo la migrazione silente
    if (prs && Object.keys(prs).length === 0) {
      // Usiamo setTimeout per de-prioritizzare il thread principale e non bloccare l'avvio dell'app
      setTimeout(async () => {
        try {
          const allLogs = await LogsRepository.getAllLogsForClient(userId, true);
          const uniqueExerciseIds = [...new Set(allLogs.map(l => l.exerciseId))];
          
          let migratedCount = 0;
          for (const exId of uniqueExerciseIds) {
            const prResult = PersonalRecord.getPR(exId, allLogs);
            if (prResult) {
              await PersonalRecordsRepository.upsertPR(userId, exId, prResult);
              migratedCount++;
            }
          }
          if (migratedCount > 0) {
            console.log(`[PR Engine] Migrazione silente completata: ${migratedCount} PR ricalcolati.`);
          }
        } catch (e) {
          console.error('[PR Engine] Errore durante migrazione silente:', e);
        }
      }, 5000); // Wait 5 seconds after load
    }
  }, [userId, prs, isLoading]);
};
