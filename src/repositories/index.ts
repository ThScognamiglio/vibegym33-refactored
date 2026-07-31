/**
 * repositories/index.ts
 *
 * Barrel export centralizzato per tutti i repository.
 * I componenti e gli hook importano da questo file, non dai singoli repository,
 * per mantenere la possibilità di rinominare o ristrutturare i file interni
 * senza propagare modifiche in tutta la codebase.
 *
 * Uso corretto:
 *   import { AuthRepository, LogsRepository } from '../repositories';
 *
 * Anti-pattern vietato:
 *   import { AuthRepository } from '../repositories/auth.repository'; // ❌
 *
 * COPERTURA COMPLETA rispetto a services/firebase.ts originale:
 *   AuthRepository      → signIn, signUp, logout, resetPassword, onAuthStateChanged,
 *                         updateProfile, deleteAuthAccount
 *   LogsRepository      → logSet, deleteLog, updateLog, getAllLogsForClient,
 *                         getSessionLogs, getWorkoutTodayLogs, getLastPerformance,
 *                         archiveOldLogs
 *   WorkoutsRepository  → getWorkout, getActivePlan, getWorkoutsForClient,
 *                         getPlanItems, createWorkout, updateWorkoutPlan, deleteWorkout [NEW]
 *   UsersRepository     → getAllPTs, toggleUserStatus, linkClientToPT, unlinkClientFromPT,
 *                         getClientsForPT, getExercises, createExercise, updateExercise,
 *                         deleteExercise, addMeasurement, getMeasurements,
 *                         getClientExerciseSummaries, getClientPlanSummary,
 *                         exportClientData, deleteAccountData
 *   SessionsRepository  → saveSessionSummary, getTodaySessions, getAllSessionsForClient,
 *                         cleanupTodaySession
 *
 * RINOMINATE rispetto all'originale (split GDPR):
 *   deleteAccountAndData → deleteAuthAccount (AuthRepository) + deleteAccountData (UsersRepository)
 */

export { AuthRepository }                              from './auth.repository';
export { LogsRepository, invalidateLogsCache }         from './logs.repository';
export { WorkoutsRepository }                          from './workouts.repository';
export { UsersRepository, invalidateExercisesCache }   from './users.repository';
export { SessionsRepository, invalidateSessionsCache } from './sessions.repository';
export { PersonalRecordsRepository }                   from './personalRecords.repository';
