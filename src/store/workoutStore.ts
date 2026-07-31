import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface WorkoutState {
  // --- Workout Lock ---
  isWorkoutActive: boolean;
  setWorkoutActive: (active: boolean) => void;

  // --- Timer State ---
  timerEndTime: number | null; // Null se non attivo, altrimenti l'epoch di fine (ms)
  totalTimerDuration: number;  // Durata iniziale in secondi (es. 90)
  isTimerPaused: boolean;
  pausedRemainingMs: number | null; // Se in pausa, quanti millisecondi mancano

  // --- Timer Actions ---
  startTimer: (seconds: number) => void;
  stopTimer: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  adjustTimer: (secondsDelta: number) => void;
}

export const useWorkoutStore = create<WorkoutState>()(
  persist(
    (set, get) => ({
      // Default state
      isWorkoutActive: false,
      setWorkoutActive: (active) => set({ isWorkoutActive: active }),

      timerEndTime: null,
      totalTimerDuration: 0,
      isTimerPaused: false,
      pausedRemainingMs: null,

      startTimer: (seconds: number) => {
        set({
          timerEndTime: Date.now() + seconds * 1000,
          totalTimerDuration: seconds,
          isTimerPaused: false,
          pausedRemainingMs: null,
        });
      },

      stopTimer: () => {
        set({
          timerEndTime: null,
          totalTimerDuration: 0,
          isTimerPaused: false,
          pausedRemainingMs: null,
        });
      },

      pauseTimer: () => {
        const state = get();
        if (!state.timerEndTime || state.isTimerPaused) return;

        const remainingMs = state.timerEndTime - Date.now();
        set({
          isTimerPaused: true,
          pausedRemainingMs: remainingMs,
        });
      },

      resumeTimer: () => {
        const state = get();
        if (!state.isTimerPaused || state.pausedRemainingMs === null) return;

        set({
          isTimerPaused: false,
          timerEndTime: Date.now() + state.pausedRemainingMs,
          pausedRemainingMs: null,
        });
      },

      adjustTimer: (secondsDelta: number) => {
        const state = get();
        if (!state.timerEndTime) return;

        // Se è in pausa, modifichiamo il remainingMs
        if (state.isTimerPaused && state.pausedRemainingMs !== null) {
          const newRemaining = Math.max(0, state.pausedRemainingMs + secondsDelta * 1000);
          set({ pausedRemainingMs: newRemaining });
        } else {
          // Se sta scorrendo, modifichiamo l'endTime
          const newEndTime = state.timerEndTime + secondsDelta * 1000;
          // Impediamo che il timer vada "indietro nel tempo" sotto lo zero
          set({ timerEndTime: Math.max(Date.now(), newEndTime) });
        }
      },
    }),
    {
      name: 'vibegym-workout-storage', // Chiave in localStorage
      storage: createJSONStorage(() => localStorage),
    }
  )
);
