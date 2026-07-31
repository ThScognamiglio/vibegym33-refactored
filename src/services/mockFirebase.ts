
import { User, Exercise, Workout, Log, ClientExerciseSummary, WorkoutItem, ClientPlanSummary, BodyMeasurement, WorkoutSession } from '../types';
import { Equipment } from '../core/domain/Equipment';

// Initial Mock Data
const MOCK_PT_ID = 'pt_123';
const MOCK_CLIENT_ID = 'client_456';

const MOCK_PT: User = {
  uid: MOCK_PT_ID,
  name: 'Coach Carter',
  email: 'coach@vibegym.com',
  role: 'pt',
  ptAssigned: null,
  inviteCode: 'VIBE2024',
  createdAt: new Date().toISOString(),
  isActive: true, // Mock PT is active
  isAdmin: true   // Mock PT is Admin
};

const MOCK_EXERCISES: Exercise[] = [
  { id: 'ex_1', ptId: MOCK_PT_ID, groupId: 'chest', name: 'Bench Press', description: 'Barbell bench press', equipment: Equipment.BARBELL, level: 'intermediate' },
  { id: 'ex_2', ptId: MOCK_PT_ID, groupId: 'legs', name: 'Squat', description: 'Back squat', equipment: Equipment.BARBELL, level: 'advanced' },
  { id: 'ex_3', ptId: MOCK_PT_ID, groupId: 'back', name: 'Pull Up', description: 'Bodyweight pull up', equipment: Equipment.BODYWEIGHT, level: 'beginner' },
  { id: 'ex_4', ptId: MOCK_PT_ID, groupId: 'shoulders', name: 'Overhead Press', description: 'Barbell overhead press', equipment: Equipment.BARBELL, level: 'intermediate' },
];

const MOCK_WORKOUT: Workout = {
  id: 'wk_1',
  ptId: MOCK_PT_ID,
  clientId: MOCK_CLIENT_ID,
  name: 'Hypertrophy Phase 1',
  status: 'ACTIVE',
  startDate: new Date().toISOString(),
  endDate: new Date(Date.now() + 86400000 * 30).toISOString(),
};

const MOCK_ITEMS: WorkoutItem[] = [
  { id: 'it_1', workoutId: 'wk_1', exerciseId: 'ex_1', dayIndex: 0, sets: 4, reps: 8, restSeconds: 90, orderIndex: 0 },
  { id: 'it_2', workoutId: 'wk_1', exerciseId: 'ex_2', dayIndex: 0, sets: 4, reps: 6, restSeconds: 120, orderIndex: 1 },
];

// In-memory store
let users: User[] = [MOCK_PT];
let exercises: Exercise[] = [...MOCK_EXERCISES];
let workouts: Workout[] = [];
let workoutItems: WorkoutItem[] = [];
let logs: Log[] = [];
let measurements: BodyMeasurement[] = [];
let summaries: Record<string, ClientExerciseSummary> = {};
let sessions: WorkoutSession[] = [];

// Helpers
export const mockAuth = {
  signIn: async (email: string, password?: string, role?: 'pt' | 'client', name?: string) => {
    // Simulate finding user
    const existing = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existing) return existing;

    // If not found, in the mock environment we can treat it as a potential sign up flow if name is provided,
    // OR just throw error to mimic real auth.
    // To keep it simple for demo, if name is provided we sign up. If not, error.
    if (name && role) {
      return mockAuth.signUp(email, password || '123456', role, name);
    }

    throw new Error("User not found (Mock)");
  },

  signUp: async (email: string, password: string, role: 'pt' | 'client', name: string) => {
    const newUser: User = {
      uid: role === 'pt' ? 'pt_' + Date.now() : 'client_' + Date.now(),
      name: name || email.split('@')[0],
      email,
      role,
      ptAssigned: null,
      inviteCode: role === 'pt' ? 'VIBE' + Math.floor(Math.random() * 1000) : undefined,
      createdAt: new Date().toISOString(),
      weight: role === 'client' ? 70 : undefined,
      height: role === 'client' ? 175 : undefined,
      goal: role === 'client' ? 'Build Muscle' : undefined,
      isActive: role === 'client', // Client active, PT inactive in real app, but for mock maybe we want active
      isAdmin: false // Default not admin
    };
    users.push(newUser);

    // If it's the specific demo client, ensure data exists
    if (role === 'client' && email === 'client@vibegym.com') {
      newUser.ptAssigned = MOCK_PT_ID;
      if (!workouts.find(w => w.clientId === newUser.uid)) {
        workouts.push({ ...MOCK_WORKOUT, clientId: newUser.uid });
        workoutItems.push(...MOCK_ITEMS);

        // Add some mock logs for history
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        logs.push({
          id: 'log_prev_1',
          userId: newUser.uid,
          workoutId: MOCK_WORKOUT.id,
          itemId: 'it_1',
          exerciseId: 'ex_1',
          date: yesterday.toISOString(),
          seriesNo: 1,
          reps: 8,
          weight: 60,
          completed: true
        });
      }
    }
    return newUser;
  },

  resetPassword: async (email: string) => {
    // Mock password reset
    const existing = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    // In mock, we pretend it worked regardless to match security best practices, 
    // or we could throw if user not found.
    if (!email.includes('@')) throw new Error("Invalid email");
    return true;
  },

  logout: async () => {
    // No-op for mock
  },

  deleteAccountAndData: async (password?: string) => {
    // No-op for mock
    console.log('Mock account deleted');
  },

  onAuthStateChanged: (callback: (user: User | null) => void) => {
    // In mock, we don't persist session across refresh automatically for simplicity,
    // or we could check localStorage. For now, trigger null to stop loading spinner.
    setTimeout(() => callback(null), 500);
    return () => { };
  },

  linkClientToPT: async (clientUid: string, inviteCode: string) => {
    const cleanCode = inviteCode.trim().toUpperCase();

    const pt = users.find(u => u.role === 'pt' && u.inviteCode?.toUpperCase() === cleanCode);
    if (!pt) throw new Error("Invalid Invite Code. Please check with your PT.");

    const clientIndex = users.findIndex(u => u.uid === clientUid);
    if (clientIndex === -1) throw new Error("Client not found");

    // Update the user in memory
    users[clientIndex] = {
      ...users[clientIndex],
      ptAssigned: pt.uid
    };

    // Assign mock workout for demo purposes once linked so the UI isn't empty
    const hasWorkout = workouts.find(w => w.clientId === clientUid);
    if (!hasWorkout) {
      const newWkId = 'wk_' + Date.now();
      const newPlan: Workout = {
        ...MOCK_WORKOUT,
        id: newWkId,
        ptId: pt.uid,
        clientId: clientUid,
        name: 'Starter Plan'
      };
      workouts.push(newPlan);

      // Add items to this new workout
      const availableEx = exercises.length > 0 ? exercises : MOCK_EXERCISES;
      const newItems: WorkoutItem[] = [];

      newItems.push({
        id: 'it_' + Date.now() + '_1',
        workoutId: newWkId,
        exerciseId: availableEx[0].id,
        dayIndex: 0,
        sets: 3,
        reps: 12,
        restSeconds: 60,
        orderIndex: 0
      });

      if (availableEx.length > 1) {
        newItems.push({
          id: 'it_' + Date.now() + '_2',
          workoutId: newWkId,
          exerciseId: availableEx[1].id,
          dayIndex: 0,
          sets: 3,
          reps: 10,
          restSeconds: 90,
          orderIndex: 1
        });
      }

      workoutItems.push(...newItems);

      // --- CRITICAL FIX: Generate History for these items so "Last Session" isn't empty ---
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      newItems.forEach(item => {
        // Generate 2 sets of history for each item
        logs.push({
          id: 'hist_' + item.id + '_1',
          userId: clientUid,
          workoutId: newWkId,
          itemId: item.id,
          exerciseId: item.exerciseId,
          date: yesterday.toISOString(),
          seriesNo: 1,
          reps: item.reps, // Matched to plan
          weight: 20, // Starting weight
          completed: true
        });
        logs.push({
          id: 'hist_' + item.id + '_2',
          userId: clientUid,
          workoutId: newWkId,
          itemId: item.id,
          exerciseId: item.exerciseId,
          date: yesterday.toISOString(),
          seriesNo: 2,
          reps: item.reps,
          weight: 20,
          completed: true
        });
      });
    }

    return users[clientIndex];
  },

  unlinkClientFromPT: async (clientUid: string) => {
    const clientIndex = users.findIndex(u => u.uid === clientUid);
    if (clientIndex === -1) throw new Error("Client not found");

    // Set ptAssigned to null, but KEEP history logs
    users[clientIndex] = {
      ...users[clientIndex],
      ptAssigned: null
    };

    return users[clientIndex];
  },

  updateProfile: async (user: User, data: Partial<User>) => {
    const idx = users.findIndex(u => u.uid === user.uid);
    if (idx > -1) {
      users[idx] = { ...users[idx], ...data };
      return users[idx];
    }
    return user;
  },

  // ADMIN MOCKS
  getAllPTs: async () => {
    return users.filter(u => u.role === 'pt');
  },

  toggleUserStatus: async (targetUid: string, isActive: boolean) => {
    const idx = users.findIndex(u => u.uid === targetUid);
    if (idx > -1) {
      users[idx] = { ...users[idx], isActive };
    }
  },
};

export const mockFirestore = {
  getExercises: async () => exercises,

  createExercise: async (ptId: string, data: Omit<Exercise, 'id' | 'ptId'>) => {
    const newEx: Exercise = {
      id: 'ex_' + Date.now(),
      ptId,
      ...data
    };
    exercises.push(newEx);
    return newEx;
  },

  updateExercise: async (exerciseId: string, data: Partial<Exercise>) => {
    const index = exercises.findIndex(e => e.id === exerciseId);
    if (index > -1) {
      exercises[index] = { ...exercises[index], ...data };
      return exercises[index];
    }
    throw new Error("Exercise not found");
  },

  deleteExercise: async (exerciseId: string) => {
    exercises = exercises.filter(e => e.id !== exerciseId);
  },

  // NEW: Updated to accept fully configured items
  createWorkout: async (ptId: string, clientId: string, name: string, items: { exerciseId: string, dayIndex: number, sets: number, reps: number, restSeconds: number, supersetGroup?: string }[], endDate?: string) => {
    const newWk: Workout = {
      id: 'wk_' + Date.now(),
      ptId,
      clientId,
      name,
      status: 'ACTIVE',
      startDate: new Date().toISOString(),
      endDate: endDate || new Date(Date.now() + 86400000 * 30).toISOString()
    };
    workouts.push(newWk);

    // Create items
    items.forEach((item, index) => {
      workoutItems.push({
        id: 'it_' + Date.now() + '_' + index,
        workoutId: newWk.id,
        exerciseId: item.exerciseId,
        dayIndex: item.dayIndex,
        sets: item.sets,
        reps: item.reps,
        restSeconds: item.restSeconds,
        orderIndex: index,
        supersetGroup: item.supersetGroup || undefined
      });
    });

    return newWk;
  },

  updateWorkoutPlan: async (workoutId: string, name: string, items: { exerciseId: string, dayIndex: number, sets: number, reps: number, restSeconds: number, supersetGroup?: string }[], endDate: string) => {
    const index = workouts.findIndex(w => w.id === workoutId);
    if (index > -1) {
      workouts[index] = {
        ...workouts[index],
        name,
        endDate
      };
      // Remove old items
      workoutItems = workoutItems.filter(i => i.workoutId !== workoutId);
      // Add new items
      items.forEach((item, index) => {
        workoutItems.push({
          id: 'it_' + Date.now() + '_' + index,
          workoutId: workoutId,
          exerciseId: item.exerciseId,
          dayIndex: item.dayIndex,
          sets: item.sets,
          reps: item.reps,
          restSeconds: item.restSeconds,
          orderIndex: index,
          supersetGroup: item.supersetGroup || undefined
        });
      });
      return workouts[index];
    }
    throw new Error("Workout not found");
  },

  getWorkout: async (workoutId: string) => {
    return workouts.find(w => w.id === workoutId) || null;
  },

  getActivePlan: async (clientId: string) => {
    // Return the most recently created active plan for this client
    return workouts
      .filter(w => w.clientId === clientId && w.status === 'ACTIVE')
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  },

  getPlanItems: async (workoutId: string) => {
    return workoutItems.filter(i => i.workoutId === workoutId).sort((a, b) => a.orderIndex - b.orderIndex);
  },

  logSet: async (log: Omit<Log, 'id'>) => {
    const newLog = { ...log, id: 'log_' + Date.now() };
    logs.push(newLog);

    // TRIGGER CLOUD FUNCTION LOGIC (Simulated)
    const exerciseLogs = logs.filter(l => l.exerciseId === log.exerciseId && l.userId === log.userId);
    const maxWeight = Math.max(...exerciseLogs.map(l => l.weight));
    const totalReps = exerciseLogs.reduce((sum, l) => sum + l.reps, 0);

    summaries[`${log.userId}_${log.exerciseId}`] = {
      exerciseId: log.exerciseId,
      totalSessions: new Set(exerciseLogs.map(l => l.date.split('T')[0])).size,
      totalReps,
      avgWeight: 0,
      pr: maxWeight,
      lastUpdated: new Date().toISOString()
    };

    return newLog.id;
  },

  deleteLog: async (userId: string, logId: string) => {
    logs = logs.filter(l => l.id !== logId);
  },

  updateLog: async (userId: string, logId: string, data: Partial<Log>) => {
    const idx = logs.findIndex(l => l.id === logId);
    if (idx > -1) {
      logs[idx] = { ...logs[idx], ...data };
    }
  },

  // Fetch detailed logs for "Last Session" functionality
  getLastPerformance: async (userId: string, exerciseId: string) => {
    // Get all logs for this user/exercise
    const userExLogs = logs.filter(l => l.userId === userId && l.exerciseId === exerciseId);

    // Sort descending by date
    userExLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (userExLogs.length === 0) return null;

    // Ensure we don't show logs from "today" if we are currently logging today
    const today = new Date().toISOString().split('T')[0];

    // Filter out today's logs entirely from the search for "Last Session"
    // This ensures we show Historical data, not what we just did 5 seconds ago
    const pastLogs = userExLogs.filter(l => l.date.split('T')[0] !== today);

    if (pastLogs.length === 0) return null; // No history before today

    // Get the most recent date from past logs
    const targetDate = pastLogs[0].date.split('T')[0];

    // Return logs for that target date
    return pastLogs.filter(l => l.date.split('T')[0] === targetDate).sort((a, b) => a.seriesNo - b.seriesNo);
  },

  // NEW: Get logs for the current session (Today) to persist data during workout
  getSessionLogs: async (userId: string, workoutId: string, exerciseId: string) => {
    const today = new Date().toISOString().split('T')[0];
    return logs.filter(l =>
      l.userId === userId &&
      l.workoutId === workoutId &&
      l.exerciseId === exerciseId &&
      l.date.split('T')[0] === today
    ).sort((a, b) => a.seriesNo - b.seriesNo);
  },

  getWorkoutTodayLogs: async (userId: string, workoutId: string) => {
    const today = new Date().toISOString().split('T')[0];
    return logs.filter(l =>
      l.userId === userId &&
      l.workoutId === workoutId &&
      l.date.split('T')[0] === today
    );
  },

  getLogs: async (userId: string, exerciseId: string) => {
    return logs.filter(l => l.userId === userId && l.exerciseId === exerciseId);
  },

  getAllLogsForClient: async (clientId: string, _fullHistory = false) => {
    return logs.filter(l => l.userId === clientId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },

  getSummary: async (userId: string, exerciseId: string) => {
    return summaries[`${userId}_${exerciseId}`];
  },

  getClientExerciseSummaries: async (clientId: string): Promise<ClientExerciseSummary[]> => {
    // Dynamically calculate summaries from logs to ensure accuracy in mock
    const clientLogs = logs.filter(l => l.userId === clientId && l.completed);
    const exMap: Record<string, ClientExerciseSummary> = {};

    clientLogs.forEach(log => {
      if (!exMap[log.exerciseId]) {
        exMap[log.exerciseId] = {
          exerciseId: log.exerciseId,
          totalSessions: 0,
          totalReps: 0,
          avgWeight: 0,
          pr: 0,
          lastUpdated: ''
        };
      }
      const entry = exMap[log.exerciseId];
      entry.totalReps += log.reps;
      if (log.weight > entry.pr) entry.pr = log.weight;
      // In a real app we would track unique sessions via sets, simplified here
      entry.totalSessions = 1;
      entry.lastUpdated = log.date > entry.lastUpdated ? log.date : entry.lastUpdated;
    });

    return Object.values(exMap);
  },

  getClientsForPT: async (ptId: string) => {
    return users.filter(u => u.ptAssigned === ptId);
  },

  getWorkoutsForClient: async (clientId: string) => {
    return workouts.filter(w => w.clientId === clientId);
  },

  // Measurements
  addMeasurement: async (data: Omit<BodyMeasurement, 'id'>) => {
    const newMeas = { ...data, id: 'meas_' + Date.now() };
    measurements.push(newMeas);
    return newMeas;
  },

  getMeasurements: async (userId: string) => {
    return measurements
      .filter(m => m.userId === userId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },

  getClientPlanSummary: async (clientId: string): Promise<ClientPlanSummary | null> => {
    // Simulate Cloud Function aggregation
    const activePlan = workouts
      .filter(w => w.clientId === clientId && w.status === 'ACTIVE')
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];

    if (!activePlan) return null;

    const planLogs = logs.filter(l => l.userId === clientId && l.workoutId === activePlan.id && l.completed);
    const uniqueDays = new Set(planLogs.map(l => l.date.split('T')[0])).size;

    // Calculate expected sessions: Assume 3 workouts/week since start date
    const startDate = new Date(activePlan.startDate);
    const now = new Date();
    const daysElapsed = Math.max(1, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 3600 * 24)));
    const weeksElapsed = daysElapsed / 7;
    const expectedSessions = Math.max(1, Math.round(weeksElapsed * 3)); // Target: 3x per week

    const adherence = Math.min(100, Math.round((uniqueDays / expectedSessions) * 100));

    // Calculate avg volume
    let totalVolume = 0;
    planLogs.forEach(l => totalVolume += (l.reps * l.weight));
    const avgWeeklyVolume = Math.round(totalVolume / Math.max(1, weeksElapsed));

    return {
      planId: activePlan.id,
      adherencePercent: adherence,
      avgWeeklyVolume,
      totalSessionsCompleted: uniqueDays
    };
  },

  cleanupTodaySession: async (userId: string, workoutId: string) => {
    return { deletedLogs: 0, cleanSets: 0, cleanVolume: 0 };
  },

  // Stub: nel mock l'archivio non fa nulla (nessun Firestore reale)
  archiveOldLogs: async (_userId: string, _dryRun = false) => {
    return { archivedMonths: 0, deletedDocs: 0, dryRun: _dryRun };
  },

  exportClientData: async (_userId: string, _planIds: string[]): Promise<object> => {
    return { export_meta: { generated_at: new Date().toISOString(), app: 'Vibe Gym (Mock)', plans_included: 0 }, plans: [], measurements: [] };
  },

  saveSessionSummary: async (session: Omit<WorkoutSession, 'id'> & { id?: string }) => {
    if (session.id) {
        const idx = sessions.findIndex(s => s.id === session.id);
        if (idx !== -1) {
            sessions[idx] = { ...session, id: session.id } as WorkoutSession;
            return session.id;
        }
    }
    const newSession: WorkoutSession = { ...session, id: 'sess_' + Date.now() } as WorkoutSession;
    sessions.push(newSession);
    return newSession.id;
  },

  getTodaySessions: async (userId: string, workoutId: string): Promise<WorkoutSession[]> => {
    const today = new Date().toISOString().split('T')[0];
    return sessions.filter(s =>
      s.userId === userId &&
      s.workoutId === workoutId &&
      s.date.split('T')[0] === today
    );
  },

  getAllSessionsForClient: async (userId: string): Promise<WorkoutSession[]> => {
    return sessions
      .filter(s => s.userId === userId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
};

// EXPORT UNIFIED API
export const api = {
  ...mockAuth,
  ...mockFirestore
};