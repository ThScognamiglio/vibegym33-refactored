import React, { useEffect, useState, useCallback, useRef } from 'react';
import { User, Workout, WorkoutItem, Exercise, Log, WorkoutSession } from '../../types';
import { LogsRepository, WorkoutsRepository, UsersRepository, SessionsRepository, PersonalRecordsRepository } from '../../repositories';
import { ActiveSessionState, clearActiveSession, saveActiveSession, enqueueWrite } from '../../offline/indexedDB';
import { syncQueue } from '../../offline/syncEngine';
import { Button } from '../../components/Button';
import { ChevronLeft, Info, CheckCircle, Trophy, Home, History, MessageSquare, Trash2, Plus, Minus, Flame, X, Dumbbell, Video, Clock, Play, Link2, Share2 } from 'lucide-react';
import { Timer } from './Timer';
import { useTranslation } from '../../services/i18n';
import { getLocalDatePart, getLocalTodayString, formatToLocaleDate, toLocalISOString } from '../../date';
import { calculateSupersetAction, getGroupColor, SUPERSET_CONFIG } from '../../core/domain/supersetLogic';
import confetti from 'canvas-confetti';
import html2canvas from 'html2canvas';
import { motion, AnimatePresence } from 'framer-motion';
import { getOverloadSuggestion, OverloadSuggestion, calculateSRPE, getSRPELabel } from '../../core/domain/coachingEngine';
import { Log as DomainLog, resolveBodyweight, Equipment, normalizeEquipment, Exercise as DomainExercise } from '../../core/domain';
import { PlateCalculator } from './PlateCalculator';
import { shouldShowWarmup } from '../../core/warmup/warmupGenerator';
import { generateWarmupSets, WarmupSet } from '../../core/warmup';
import { DEFAULT_PLATES } from '../../core/warmup/plateCalculator';
import { SupersetCard } from './SupersetCard';
import { useWorkoutStore } from '../../store/workoutStore';
import { PersonalRecord } from '../../core/domain/PersonalRecord';
import { useQueryClient } from '@tanstack/react-query';
import { useExercisePR } from '../../hooks/usePersonalRecords';

interface Props {
    user: User;
    workout: Workout;
    dayIndex: number;
    initialSummary?: WorkoutSession;
    onExit: () => void;
    restoredState?: ActiveSessionState;
}

// Helper for RPE Color
const getRpeColor = (val: number) => {
    if (val <= 4) return 'text-green-400';
    if (val <= 7) return 'text-yellow-400';
    return 'text-red-500';
};

const getRpeLabel = (val: number) => {
    if (val <= 4) return 'Easy';
    if (val <= 6) return 'Moderate';
    if (val <= 8) return 'Hard';
    return 'Maximum Effort';
};

export const WorkoutLogger: React.FC<Props> = ({ user, workout, dayIndex, initialSummary, onExit, restoredState }) => {
    const [items, setItems] = useState<WorkoutItem[]>([]);
    const [exercises, setExercises] = useState<Record<string, Exercise>>({});
    const [lastSessionLogs, setLastSessionLogs] = useState<Log[]>([]);
    const { t } = useTranslation();
    const queryClient = useQueryClient();

    // Local state
    const [activeItemIndex, setActiveItemIndex] = useState(restoredState?.activeItemIndex ?? 0);
    const { data: currentExercisePR } = useExercisePR(user.uid, items[activeItemIndex]?.exerciseId);

    // Frictionless Inputs
    const [reps, setReps] = useState<number>(restoredState?.reps ?? 0);
    const [weight, setWeight] = useState<number>(restoredState?.weight ?? 0);
    const [rpe, setRpe] = useState<number>(restoredState?.rpe ?? 7); // Default Moderate-Hard

    const [note, setNote] = useState<string>(restoredState?.note ?? '');

    // All logs for the current session, keyed by exerciseId — survives index changes
    const [allLogs, setAllLogs] = useState<Record<string, any[]>>(restoredState?.allLogs ?? {});

    // States for flow
    const [isComplete, setIsComplete] = useState(false);
    const [loading, setLoading] = useState(true);

    // Timer State (Now handled globally by Zustand)
    const { startTimer, setWorkoutActive } = useWorkoutStore();

    // Set global SW workout lock via Zustand
    useEffect(() => {
        setWorkoutActive(true);
        return () => {
            setWorkoutActive(false);
        };
    }, [setWorkoutActive]);

    // UI States
    const [showInfo, setShowInfo] = useState(false);
    const [showSocialPreview, setShowSocialPreview] = useState(false);
    
    // AI Coaching States
    const [overloadSuggestion, setOverloadSuggestion] = useState<OverloadSuggestion | null>(null);
    const [badgeCollapsed, setBadgeCollapsed] = useState(false);

    // Plate Calculator State
    const [showPlateCalc, setShowPlateCalc] = useState(false);

    // Warm-Up RAMP State
    const [warmupSets, setWarmupSets] = useState<WarmupSet[]>([]);
    const [warmupCollapsed, setWarmupCollapsed] = useState(false);
    const [warmupDismissed, setWarmupDismissed] = useState(false);


    const [isCleaningUp, setIsCleaningUp] = useState(false);

    const [isDirty, setIsDirty] = useState(false);

    // Session Stats for Summary
    const [sessionVolume, setSessionVolume] = useState(restoredState?.sessionVolume ?? 0);
    const [setsCompleted, setSetsCompleted] = useState(restoredState?.setsCompleted ?? 0);
    const [sessionRpeSum, setSessionRpeSum] = useState(restoredState?.sessionRpeSum ?? 0);



    // Superset: track completed ROUNDS per group (survives index changes)
    const [supersetRoundTracker, setSupersetRoundTracker] = useState<Record<string, number>>({});
    // Superset Transition State
    const [supersetTransition, setSupersetTransition] = useState(false);

    // Time tracking (Total Active Seconds)
    const [activeSeconds, setActiveSeconds] = useState(restoredState?.activeSeconds ?? 0);

    // Track the active session document ID to update it instead of re-creating
    const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(restoredState?.currentSessionId ?? initialSummary?.id);
    const sessionIdRef = useRef<string | undefined>(restoredState?.currentSessionId ?? initialSummary?.id);

    // Sync ref when currentSessionId changes from outside (like the load effect)
    useEffect(() => {
        if (currentSessionId) sessionIdRef.current = currentSessionId;
    }, [currentSessionId]);

    const isFirstMountRef = useRef(true);

    // ─── CRASH RECOVERY ───────────────────────────────────────────────────────
    // Key for localStorage checkpoint of this specific workout session
    const sessionCheckpointKey = `vg_pos_${user.uid}_${workout.id}_${dayIndex}`;

    // Save current position to localStorage (called inside visibilitychange)
    const savePositionCheckpoint = useCallback((index: number) => {
        try {
            localStorage.setItem(sessionCheckpointKey, JSON.stringify({
                activeItemIndex: index,
                savedAt: Date.now()
            }));
        } catch (_) { /* quota exceeded — non-critical */ }
    }, [sessionCheckpointKey]);

    // Restore position from localStorage on mount (if checkpoint is < 4 hours old)
    const [restoredFromCheckpoint, setRestoredFromCheckpoint] = useState(false);
    const pendingRestoreIndexRef = useRef<number | null>(null);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(sessionCheckpointKey);
            if (!raw) return;
            const { activeItemIndex: savedIndex, savedAt } = JSON.parse(raw) as { activeItemIndex: number; savedAt: number };
            const ageMs = Date.now() - savedAt;
            const FOUR_HOURS = 4 * 60 * 60 * 1000;
            if (ageMs < FOUR_HOURS && typeof savedIndex === 'number' && savedIndex > 0) {
                // We can't set the index here because items haven't loaded yet.
                // Store it in a ref and apply it after the initial load.
                pendingRestoreIndexRef.current = savedIndex;
            }
        } catch (_) { /* corrupted data — ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // ─── END CRASH RECOVERY ───────────────────────────────────────────────────


    // FIX: Quando l'utente torna all'editor dal recap ("Edit workout"),
    // ricalcola i totali dai log correnti per evitare double-counting.
    useEffect(() => {
        if (!isComplete && !loading) {
            const allCompletedLogs = (Object.values(allLogs).flat() as Log[]).filter(
                l => l.completed !== false && !l.id?.startsWith('temp_skip_')
            );
            const domainLogs = allCompletedLogs.map(l => new DomainLog(l));
            const vol = domainLogs.reduce((acc, l) => {
                const ex = exercises[l.exerciseId];
                const isBw = ex ? (normalizeEquipment(ex.equipment) === Equipment.BODYWEIGHT) : false;
                const isUni = ex ? !!ex.isUnilateral : false;
                const logBw = resolveBodyweight(l.bodyweightAtLog, user.weight);
                return acc + l.calculateVolume({ isBodyweight: isBw, isUnilateral: isUni }, logBw);
            }, 0);
            const rpeSum = allCompletedLogs.reduce((acc, l) => acc + (l.rpe ?? 7), 0);
            setSessionVolume(vol);
            setSetsCompleted(allCompletedLogs.length);
            setSessionRpeSum(rpeSum);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isComplete]);

    // 1. Initial Load: Get Items and Exercises
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const allItems = await WorkoutsRepository.getPlanItems(workout.id);

            // FILTER ITEMS BY DAY
            const dayItems = allItems.filter(i => i.dayIndex === dayIndex);

            setItems(dayItems);

            // Fetch Exercises
            const exList = await UsersRepository.getExercises(user.ptAssigned || undefined);

            const exMap: Record<string, Exercise> = {};
            exList.forEach(e => exMap[e.id] = e);
            setExercises(exMap);

            // If we have restoredState, load it and skip fetching from DB
            if (restoredState) {
                setAllLogs(restoredState.allLogs);
                setSessionVolume(restoredState.sessionVolume);
                setSetsCompleted(restoredState.setsCompleted);
                setSessionRpeSum(restoredState.sessionRpeSum);
                setActiveSeconds(restoredState.activeSeconds);
                setCurrentSessionId(restoredState.currentSessionId);
                sessionIdRef.current = restoredState.currentSessionId;
                setActiveItemIndex(restoredState.activeItemIndex);

                // Timer is now handled by Zustand's persist middleware,
                // so we don't need to restore it from IndexedDB anymore!
            } else if (initialSummary) {
                if (initialSummary.id) setCurrentSessionId(initialSummary.id);
                setSessionVolume(initialSummary.volume);
                setSetsCompleted(initialSummary.sets);
                setSessionRpeSum(parseFloat(initialSummary.avgRpe || '0') * initialSummary.sets);
                setActiveSeconds(initialSummary.activeSeconds ?? initialSummary.durationMinutes * 60);
                setIsComplete(true);
            } else {
                // Fetch today's logs for this workout to initialize totals
                const todayLogs = await LogsRepository.getWorkoutTodayLogs(user.uid, workout.id);
                if (todayLogs.length > 0) {
                    let totalVolume = 0;
                    let rpeSum = 0;
                    const logsMap: Record<string, Log[]> = {};

                    todayLogs.forEach(log => {
                        // FIX: Escludi serie saltate dal calcolo dei totali al caricamento iniziale
                        if (log.completed === false) {
                            if (!logsMap[log.exerciseId]) logsMap[log.exerciseId] = [];
                            logsMap[log.exerciseId].push(log);
                            return;
                        }

                        const ex = exMap[log.exerciseId];
                        const isBw = ex ? (normalizeEquipment(ex.equipment) === Equipment.BODYWEIGHT) : false;
                        const isUni = ex ? !!ex.isUnilateral : false;
                        const domainLog = new DomainLog(log);
                        const logBw = resolveBodyweight(log.bodyweightAtLog, user.weight);
                        totalVolume += domainLog.calculateVolume({ isBodyweight: isBw, isUnilateral: isUni }, logBw);

                        // Extract RPE from note if available
                        let logRpe = 7;
                        if (log.rpe !== undefined) {
                            logRpe = log.rpe;
                        } else if (log.note) {
                            const match = log.note.match(/RPE:\s*([\d\.]+)/);
                            if (match) logRpe = parseFloat(match[1]);
                        }
                        rpeSum += logRpe;

                        if (!logsMap[log.exerciseId]) logsMap[log.exerciseId] = [];
                        logsMap[log.exerciseId].push(log);
                    });

                    // FIX: Deduplicazione log per (exerciseId, seriesNo).
                    // Se ci sono log identici per seriesNo (da sessioni di test precedenti),
                    // tieni solo quello con il peso maggiore per evitare duplicati in UI.
                    Object.keys(logsMap).forEach(exId => {
                        const seen = new Map<number, Log>();
                        logsMap[exId].forEach(log => {
                            const key = log.seriesNo;
                            if (!seen.has(key) || (log.weight > (seen.get(key)?.weight ?? 0))) {
                                seen.set(key, log);
                            }
                        });
                        logsMap[exId] = Array.from(seen.values()).sort((a, b) => a.seriesNo - b.seriesNo);
                    });

                    const completedCount = todayLogs.filter(l => l.completed !== false).length;
                    setSessionVolume(totalVolume);
                    setSetsCompleted(completedCount);
                    setSessionRpeSum(rpeSum);

                    // Pre-populate allLogs with these today's logs
                    Object.keys(logsMap).forEach(exId => {
                        logsMap[exId].sort((a, b) => a.seriesNo - b.seriesNo);
                    });
                    setAllLogs(logsMap);

                    // BUG 3 FIX: Recupera l'ID della sessione esistente anche quando
                    // initialSummary non è stato passato (es. offline, session nel queue
                    // di Firebase ma non ancora nella local cache di Firestore).
                    // Senza questo, currentSessionId resta undefined e il salvataggio
                    // al finish crea UNA NUOVA sessione duplicata invece di aggiornare quella esistente.
                    const todaySessions = await SessionsRepository.getTodaySessions(user.uid, workout.id);
                    if (todaySessions.length > 0) {
                        setCurrentSessionId(todaySessions[0].id);
                    }
                } else {
                    // Check if a session already exists for today even if not passed as prop
                    const todaySessions = await SessionsRepository.getTodaySessions(user.uid, workout.id);
                    if (todaySessions.length > 0) {
                        const existing = todaySessions[0];
                        setCurrentSessionId(existing.id);
                        setSessionVolume(existing.volume);
                        setSetsCompleted(existing.sets);
                        setSessionRpeSum(parseFloat(existing.avgRpe || '0') * existing.sets);
                        setActiveSeconds(existing.activeSeconds ?? existing.durationMinutes * 60);
                    } else {
                        setActiveSeconds(0);
                    }
                }
            }

            setLoading(false);

            // ─── CRASH RECOVERY: apply saved position after items load ────────
            if (pendingRestoreIndexRef.current !== null) {
                const savedIndex = pendingRestoreIndexRef.current;
                pendingRestoreIndexRef.current = null;
                if (dayItems[savedIndex]) {
                    setActiveItemIndex(savedIndex);
                    setRestoredFromCheckpoint(true);
                    // Auto-hide toast after 4 seconds
                    setTimeout(() => setRestoredFromCheckpoint(false), 4000);
                }
            }
            // ─── END CRASH RECOVERY ──────────────────────────────────────────
        };
        load();

    }, [workout, dayIndex, user.ptAssigned, initialSummary]);

    // AI Coaching: Progressive Overload Engine
    useEffect(() => {
        const currentItem = items[activeItemIndex];
        if (!currentItem || lastSessionLogs.length === 0) {
            setOverloadSuggestion(null);
            return;
        }
        
        const exercise = exercises[currentItem.exerciseId];
        const isBodyweight = exercise ? (normalizeEquipment(exercise.equipment) === Equipment.BODYWEIGHT) : false;
        
        const suggestion = getOverloadSuggestion(lastSessionLogs, currentItem.reps, currentExercisePR, {
            isBodyweight,
            groupId: exercise?.groupId
        });
        
        if (suggestion) {
            setOverloadSuggestion(suggestion);
            setBadgeCollapsed(false);
            const t = setTimeout(() => setBadgeCollapsed(true), 5000);
            return () => clearTimeout(t);
        } else {
            setOverloadSuggestion(null);
        }
    }, [lastSessionLogs, activeItemIndex, items, exercises, currentExercisePR]);

    // Warm-Up RAMP: calcola e mostra il banner al cambio esercizio
    useEffect(() => {
        setWarmupDismissed(false);
        setWarmupCollapsed(false);
        const currentItem = items[activeItemIndex];
        if (!currentItem) { setWarmupSets([]); return; }

        const currentLogs = allLogs[currentItem.exerciseId] ?? [];
        const isCompound = !!(currentItem as any).nscaCategory ||
            !!(currentItem as any).exercise?.nscaCategory;
        const lastWeight = lastSessionLogs[0]?.weight ?? 0;

        if (!shouldShowWarmup(lastWeight, true, currentLogs.length)) {
            setWarmupSets([]);
            return;
        }

        const availablePlates: number[] = (() => {
            try { const s = localStorage.getItem('vg_gym_plates'); return s ? JSON.parse(s) : DEFAULT_PLATES; }
            catch { return DEFAULT_PLATES; }
        })();

        const currentExercise = exercises[currentItem.exerciseId];
        const equipment = currentExercise?.equipment;

        const sets = generateWarmupSets(equipment, lastWeight, {
            barbellWeight: 20,
            availablePlates
        });
        setWarmupSets(sets);

        if (sets.length > 0) {
            const t = setTimeout(() => setWarmupCollapsed(true), 6000);
            return () => clearTimeout(t);
        }
    }, [activeItemIndex, items, lastSessionLogs, allLogs, exercises]);

    // 2. Active Timer Loop
    useEffect(() => {
        if (loading || isComplete) return;

        const interval = setInterval(() => {
            setActiveSeconds(prev => prev + 1);
        }, 1000);

        return () => clearInterval(interval);
    }, [loading, isComplete]);

    // 3. Exercise Data Load (Runs when activeItemIndex changes)
    useEffect(() => {
        const loadExerciseData = async () => {
            if (items.length === 0) return;
            const currentItem = items[activeItemIndex];
            if (!currentItem) return;

            // Fetch History (Last Session before today)
            const prevLogs = await LogsRepository.getLastPerformance(user.uid, currentItem.exerciseId);
            setLastSessionLogs(prevLogs || []);

            if (isFirstMountRef.current && restoredState) {
                isFirstMountRef.current = false;
                return;
            }
            isFirstMountRef.current = false;

            // Clear only the per-exercise transient state
            setLastSessionLogs(prevLogs || []);
            setNote('');
            setRpe(7);

            // Only fetch today's logs from DB if not already in memory (first visit to this exercise)
            if (!allLogs[currentItem.exerciseId]) {
                const todayLogs = await LogsRepository.getSessionLogs(user.uid, workout.id, currentItem.exerciseId);
                setAllLogs(prev => ({ ...prev, [currentItem.exerciseId]: todayLogs }));

                const logsToUse = todayLogs;
                if (logsToUse.length > 0) {
                    const lastSet = logsToUse[logsToUse.length - 1];
                    setReps(lastSet.reps);
                    setWeight(lastSet.weight);
                } else if (prevLogs && prevLogs.length > 0) {
                    setReps(prevLogs[0].reps);
                    setWeight(prevLogs[0].weight);
                } else {
                    setReps(currentItem.reps);
                    setWeight(0);
                }
            } else {
                // Already loaded — just update inputs from cached data
                const cached = allLogs[currentItem.exerciseId];
                if (cached.length > 0) {
                    const lastSet = cached[cached.length - 1];
                    setReps(lastSet.reps);
                    setWeight(lastSet.weight);
                } else if (prevLogs && prevLogs.length > 0) {
                    setReps(prevLogs[0].reps);
                    setWeight(prevLogs[0].weight);
                } else {
                    setReps(currentItem.reps);
                    setWeight(0);
                }
            }
        };

        loadExerciseData();
        setIsDirty(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeItemIndex, items, user.uid, workout.id]);

    // 4. Helper to persist partial session state
    const persistSessionState = async () => {
        const avgRpe = setsCompleted > 0 ? (sessionRpeSum / setsCompleted).toFixed(1) : '0.0';
        try {
            // BUG 5 FIX: Previene la creazione di doppie sessioni.
            // Quando offline o se si salvano serie velocemente, la Promise di saveSessionSummary
            // non ha ancora aggiornato lo state "currentSessionId".
            // Usiamo useRef e generiamo un custom ID ("local_...") per forzare un setDoc
            // coerente per tutte le chiamate parallele.
            let targetId = sessionIdRef.current || currentSessionId;
            if (!targetId) {
                targetId = 'local_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
                setCurrentSessionId(targetId);
                sessionIdRef.current = targetId;
            }

            await enqueueWrite(user.uid, 'saveSessionSummary', {
                id: targetId,
                userId: user.uid,
                workoutId: workout.id,
                dayIndex,
                date: toLocalISOString(new Date()),
                volume: sessionVolume,
                sets: setsCompleted,
                avgRpe,
                durationMinutes: Math.floor(activeSeconds / 60),
                activeSeconds
            });
            syncQueue(user.uid);
            if (!currentSessionId) {
                setCurrentSessionId(targetId);
                sessionIdRef.current = targetId;
            }
        } catch (e) {
            console.error("Failed to persist partial session", e);
        }
    };


    // FIX 1: No isSavingLog state — the UI is never blocked waiting for Firebase.
    // Firebase SDK queues requests offline and flushes them on reconnection automatically.
    const handleLogSet = async () => {
        const currentItem = items[activeItemIndex];
        if (!currentItem) return;
        const currentLogs = allLogs[currentItem.exerciseId] ?? [];
        const repsVal = reps;
        if (repsVal === 0) return;

        const tempId = 'local_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
        const finalNote = note ? `${note} (RPE: ${rpe})` : `RPE: ${rpe}`;
        const newSeriesNo = currentLogs.length + 1;

        const currentBw = resolveBodyweight(undefined, user.weight);
        const newLog: Log = {
            id: tempId,
            userId: user.uid,
            workoutId: workout.id,
            itemId: currentItem.id,
            exerciseId: currentItem.exerciseId,
            seriesNo: newSeriesNo,
            reps: repsVal,
            weight: weight,
            completed: true,
            date: new Date().toISOString(),
            note: finalNote,
            rpe: rpe,
            bodyweightAtLog: currentBw
        };

        // Optimistic update — UI reacts immediately, no waiting for network
        setAllLogs(prev => ({
            ...prev,
            [currentItem.exerciseId]: [...(prev[currentItem.exerciseId] ?? []), newLog]
        }));
        const ex = exercises[currentItem.exerciseId];
        const isBw = ex ? (normalizeEquipment(ex.equipment) === Equipment.BODYWEIGHT) : false;
        const isUni = ex ? !!ex.isUnilateral : false;
        const domainLog = new DomainLog(newLog);
        const logBw = resolveBodyweight(newLog.bodyweightAtLog, user.weight);
        const setVol = domainLog.calculateVolume({ isBodyweight: isBw, isUnilateral: isUni }, logBw);
        setSessionVolume(prev => prev + setVol);
        setSetsCompleted(prev => prev + 1);
        setSessionRpeSum(prev => prev + rpe);
        setNote('');
        setIsDirty(false);

        // Start Timer
        if (currentItem.restSeconds > 0) {
            startTimer(currentItem.restSeconds);
        }

        // Persist partial session immediately (fire-and-forget)
        persistSessionState();

        // Send to offline queue (IndexedDB)
        enqueueWrite(user.uid, 'logSet', {
            id: tempId,
            userId: user.uid,
            workoutId: workout.id,
            itemId: currentItem.id,
            exerciseId: currentItem.exerciseId,
            date: toLocalISOString(new Date()),
            seriesNo: newSeriesNo,
            reps: repsVal,
            weight: weight,
            completed: true,
            rpe: rpe,
            note: finalNote,
            bodyweightAtLog: currentBw
        }).then(() => {
            syncQueue(user.uid);
        }).catch(e => {
            console.error("Failed to enqueue set", e);
        });

        // L'aggiornamento state superset non avviene qui nel V2, 
        // è gestito interamente nel SupersetCard on-change.
    };

    const handleDeleteLog = async (index: number) => {
        const currentItem = items[activeItemIndex];
        if (!currentItem) return;
        const exerciseId = currentItem.exerciseId;
        const currentLogs = allLogs[exerciseId] ?? [];
        const logToDelete = currentLogs[index];
        if (!logToDelete) return;

        const updatedLogs = currentLogs.filter((_, i) => i !== index).map((l, i) => ({
            ...l,
            seriesNo: i + 1
        }));

        // Update local state immediately
        setAllLogs(prev => ({ ...prev, [exerciseId]: updatedLogs }));

        // Adjust totals — solo per serie completate (le skip hanno completed=false e reps/weight=0)
        if (logToDelete.completed !== false) {
            const ex = exercises[exerciseId];
            const isBw = ex ? (normalizeEquipment(ex.equipment) === Equipment.BODYWEIGHT) : false;
            const isUni = ex ? !!ex.isUnilateral : false;
            const domainLog = new DomainLog(logToDelete);
            const logBw = resolveBodyweight(logToDelete.bodyweightAtLog, user.weight);
            const setVol = domainLog.calculateVolume({ isBodyweight: isBw, isUnilateral: isUni }, logBw);
            setSessionVolume(prev => Math.max(0, prev - setVol));
            setSetsCompleted(prev => Math.max(0, prev - 1));

            // Calculate RPE to remove — use the dedicated field first, then regex fallback for legacy logs
            const rpeToRemove = logToDelete.rpe
                ?? (() => {
                    if (!logToDelete.note) return 0;
                    const match = logToDelete.note.match(/RPE:\s*([\d\.]+)/);
                    return match ? parseFloat(match[1]) : 0;
                })();
            setSessionRpeSum(prev => Math.max(0, prev - rpeToRemove));
        }

        // FIX: Le serie con ID temp_skip_ (skip) non esistono ancora su Firebase → skip la delete remota.
        const isTemporarySkip = logToDelete.id?.startsWith('temp_skip_');
        if (!isTemporarySkip) {
            try {
                await enqueueWrite(user.uid, 'deleteLog', {
                    userId: user.uid,
                    logId: logToDelete.id
                });
                syncQueue(user.uid);
            } catch (e) {
                console.error("Failed to enqueue delete log", e);
                alert(t('error_delete_log'));
            }
        }

        // Re-index seriesNo in queue for all remaining persisted logs.
        const reindexPromises = updatedLogs
            .filter(l => l.id && !l.id.startsWith('temp_skip_'))
            .map(l => enqueueWrite(user.uid, 'updateLog', {
                userId: user.uid,
                logId: l.id,
                data: { seriesNo: l.seriesNo }
            }).then(() => syncQueue(user.uid)));
            
        await Promise.all(reindexPromises).catch(e => console.error('Failed to enqueue re-index series numbers', e));

        // Persist updated session totals to DB
        persistSessionState();
    };

    const handleNextExercise = async () => {
        // Auto-save se l'utente ha modificato i dati ma non ha cliccato "Salva Serie"
        if (isDirty && reps > 0) {
            await handleLogSet();
        }

        // --- AUTO SKIP LOGIC (Opzione B) ---
        const currentItem = items[activeItemIndex];
        if (currentItem) {
            const currentLogs = allLogs[currentItem.exerciseId] ?? [];
            const missingSets = currentItem.sets - currentLogs.length;

            if (missingSets > 0) {
                const newLocalLogs: Log[] = [];
                for (let i = 0; i < missingSets; i++) {
                    const tempId = 'temp_skip_' + Date.now() + i;
                    const newSeriesNo = currentLogs.length + i + 1;
                    const fakeLog: Log = {
                        id: tempId,
                        userId: user.uid,
                        workoutId: workout.id,
                        itemId: currentItem.id,
                        exerciseId: currentItem.exerciseId,
                        seriesNo: newSeriesNo,
                        reps: 0,
                        weight: 0,
                        completed: false,
                        date: toLocalISOString(new Date()),
                        note: t('skipped_auto') || 'Skipped automatically'
                    };
                    newLocalLogs.push(fakeLog);
                    // BUG 1 FIX: I log skip rimangono SOLO nello stato locale (ID temp_skip_*).
                    // NON vengono scritti su Firebase per evitare:
                    //  • Race condition delete: l'utente elimina il log prima che la Promise
                    //    risolva il realId → il documento rimane orfano su Firestore.
                    //  • Inquinamento dei grafici (volume, radar, heatmap, adherence).
                    //  • Problemi offline: la Promise non si risolve mai durante la sessione.
                    // handleDeleteLog rileva già 'temp_' e salta la delete remota → funziona correttamente.
                    // Il recap finale (handleNextExercise → isComplete) esclude già i log skip
                    // con il filtro `l.completed !== false && !l.id?.startsWith('temp_skip_')`.
                }

                // Append optimistic logs (local-only, never persisted to Firebase)
                setAllLogs(prev => ({
                    ...prev,
                    [currentItem.exerciseId]: [...(prev[currentItem.exerciseId] ?? []), ...newLocalLogs]
                }));
            }
        }

        if (activeItemIndex < items.length - 1) {
            const nextIndex = activeItemIndex + 1;
            setActiveItemIndex(nextIndex);
        } else {
            setIsComplete(true);
            confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#22d3ee', '#10b981', '#fbbf24']
            });

            // FIX: Ricalcola i totali dai log reali al momento del finish,
            // escludendo le serie saltate (completed=false) e gli ID temporanei di skip.
            // Questo evita che edit-workout multipli o serie saltate contaminino i dati finali.
            const allCompletedLogs = (Object.values(allLogs).flat() as Log[]).filter(
                l => l.completed !== false && !l.id?.startsWith('temp_skip_')
            );
            const domainLogs = allCompletedLogs.map(l => new DomainLog(l));
            const finalVolume = domainLogs.reduce((acc, l) => {
                const ex = exercises[l.exerciseId];
                const isBw = ex ? (normalizeEquipment(ex.equipment) === Equipment.BODYWEIGHT) : false;
                const isUni = ex ? !!ex.isUnilateral : false;
                const logBw = resolveBodyweight(l.bodyweightAtLog, user.weight);
                return acc + l.calculateVolume({ isBodyweight: isBw, isUnilateral: isUni }, logBw);
            }, 0);
            const finalSets = allCompletedLogs.length;
            const finalRpeSum = allCompletedLogs.reduce((acc, l) => acc + (l.rpe ?? 7), 0);
            const finalAvgRpe = finalSets > 0 ? (finalRpeSum / finalSets).toFixed(1) : '0.0';
            const durationMinutes = Math.floor(activeSeconds / 60);

            // Sync state so the recap screen shows the correct values
            setSessionVolume(finalVolume);
            setSetsCompleted(finalSets);
            setSessionRpeSum(finalRpeSum);

            enqueueWrite(user.uid, 'saveSessionSummary', {
                id: currentSessionId,
                userId: user.uid,
                workoutId: workout.id,
                dayIndex,
                date: toLocalISOString(new Date()),
                volume: finalVolume,
                sets: finalSets,
                avgRpe: finalAvgRpe,
                durationMinutes,
                activeSeconds
            }).then(() => {
                syncQueue(user.uid);
                // Clear checkpoint on completion
                try { localStorage.removeItem(sessionCheckpointKey); } catch (_) {}
                clearActiveSession(user.uid).catch(err => console.error('[WorkoutLogger] Failed to clear active session:', err));

                // --- BACKGROUND SYNC: Personal Records Engine (Fase 11) ---
                setTimeout(async () => {
                    try {
                        const uniqueExerciseIds = [...new Set(allCompletedLogs.map(l => l.exerciseId))];
                        for (const exId of uniqueExerciseIds) {
                            const fullLogsForEx = await LogsRepository.getAllLogsForClient(user.uid, true);
                            const prResult = PersonalRecord.getPR(exId, fullLogsForEx);
                            if (prResult) {
                                await PersonalRecordsRepository.upsertPR(user.uid, exId, prResult);
                            }
                        }
                        queryClient.invalidateQueries({ queryKey: ['personalRecords', user.uid] });
                        queryClient.invalidateQueries({ queryKey: ['personalRecord', user.uid] });
                    } catch (e) {
                        console.error('[PR Engine] Background sync failed:', e);
                    }
                }, 0);
            }).catch(e => console.error('Failed to enqueue session summary', e));
        }
    };

    const handleManualTimer = () => {
        startTimer(60); // Default manual start to 60s
    };

    // Helpers for Steppers
    const adjustWeight = (delta: number) => { setWeight(prev => Math.max(0, parseFloat((prev + delta).toFixed(1)))); setIsDirty(true); };
    const adjustReps = (delta: number) => { setReps(prev => Math.max(0, prev + delta)); setIsDirty(true); };


    // --- HTML2CANVAS DOWNLOAD ---
    const [isDownloading, setIsDownloading] = useState(false);

    // HOOKS MUST BE DECLARED BEFORE ANY EARLY RETURNS (Rules of Hooks).
    // Memoize onComplete so the Timer's useEffect never sees a new reference each render.
    // Without this, the activeSeconds interval triggers re-renders that recreate the callback,
    // breaking the Timer's own setInterval.
    const handleTimerComplete = useCallback(() => setShowTimer(false), []);

    // Dynamic Active Session Persistence to IndexedDB
    useEffect(() => {
        if (loading || isComplete) return;

        const saveToDB = async () => {
            try {
                await saveActiveSession({
                    userId: user.uid,
                    workoutId: workout.id,
                    dayIndex,
                    activeItemIndex,
                    reps,
                    weight,
                    rpe,
                    note,
                    allLogs,
                    activeSeconds,
                    currentSessionId,
                    sessionVolume,
                    setsCompleted,
                    sessionRpeSum,
                    lastUpdated: Date.now()
                });
            } catch (err) {
                console.error('[WorkoutLogger] Failed to save active session to IndexedDB:', err);
            }
        };
        saveToDB();
    }, [
        loading,
        isComplete,
        user.uid,
        workout.id,
        dayIndex,
        activeItemIndex,
        reps,
        weight,
        rpe,
        note,
        allLogs,
        activeSeconds,
        currentSessionId,
        sessionVolume,
        setsCompleted,
        sessionRpeSum
    ]);

    // FIX: Standby / Page Visibility — salva lo stato ogni volta che
    // il browser nasconde la pagina (screen lock, cambio app, ecc.).
    // L'SDK di Firebase accoda le scritture offline e le sincronizza alla riconnessione.
    // EXTENDED: ora salva anche la posizione (esercizio corrente) in localStorage.
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden' && !isComplete && !loading) {
                persistSessionState();
                savePositionCheckpoint(activeItemIndex);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isComplete, loading, sessionVolume, setsCompleted, sessionRpeSum, activeSeconds, currentSessionId, activeItemIndex]);


    const handleDownloadImage = async () => {
        const element = document.getElementById('social-share-card');
        if (!element) return;

        setIsDownloading(true);
        try {
            const canvas = await html2canvas(element, {
                scale: 3, // High resolution
                backgroundColor: '#111827', // Match bg-gray-900
                logging: false,
                useCORS: true,
                allowTaint: true
            });

            try {
                // Prepara il blob per la condivisione nativa
                const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
                if (blob && navigator.share && navigator.canShare) {
                    const file = new File([blob], `VibeGym_Day${dayIndex + 1}.jpg`, { type: 'image/jpeg' });
                    if (navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            title: t('share_title'),
                            files: [file]
                        });
                        return; // Condiviso con successo
                    }
                }
            } catch (err) {
                console.warn("Native share failed or omitted", err);
            }

            // Fallback al download classico se il Web Share API non è supportato (es. PC)
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            const link = document.createElement('a');
            link.download = `VibeGym_Workout_Day${dayIndex + 1}.jpg`;
            link.href = dataUrl;
            link.click();
        } catch (e) {
            console.error("Failed to generate image", e);
            alert(t('error_image_gen'));
        } finally {
            setIsDownloading(false);
        }
    };

    // --- CLEANUP HANDLER ---
    const handleCleanupSession = async () => {
        if (!currentSessionId) return;
        if (!confirm('Questo cancellerà tutte le serie saltate e i duplicati di oggi, ricalcolando i totali da zero. Continuare?')) return;
        setIsCleaningUp(true);
        try {
            const result = await SessionsRepository.cleanupTodaySession(user.uid, workout.id);
            alert(`✅ Cleanup completato!\n• ${result.deletedLogs} log rimossi\n• Serie reali rimaste: ${result.cleanSets}\n• Volume pulito: ${result.cleanVolume} kg`);
            // Reload the today's logs to reflect clean state
            const todayLogs = await LogsRepository.getWorkoutTodayLogs(user.uid, workout.id);
            const cleanMap: Record<string, Log[]> = {};
            let vol = 0;
            let rpeSum = 0;
            todayLogs.filter(l => l.completed !== false).forEach(l => {
                vol += l.weight * l.reps;
                rpeSum += (l.rpe ?? 7);
                if (!cleanMap[l.exerciseId]) cleanMap[l.exerciseId] = [];
                cleanMap[l.exerciseId].push(l);
            });
            setAllLogs(cleanMap);
            setSessionVolume(result.cleanVolume);
            setSetsCompleted(result.cleanSets);
            setSessionRpeSum(rpeSum);
        } catch (e) {
            console.error('Cleanup failed', e);
            alert('Errore durante il cleanup. Riprova.');
        } finally {
            setIsCleaningUp(false);
        }
    };

    // --- WORKOUT SUMMARY VIEW ---
    if (isComplete) {
        const avgRpe = setsCompleted > 0 ? (sessionRpeSum / setsCompleted).toFixed(1) : '0.0';
        const mins = Math.floor(activeSeconds / 60);
        const remainingSecs = activeSeconds % 60;
        const timeElapsedStr = mins >= 60
            ? `${Math.floor(mins / 60)}h ${mins % 60}m`
            : `${mins}m ${remainingSecs}s`;
            
        const isTodaySession = getLocalDatePart(initialSummary?.date || new Date()) === getLocalTodayString();
        const displayDate = formatToLocaleDate(initialSummary?.date || new Date());

        const sessionSrpe = calculateSRPE({ durationMinutes: mins, avgRpe: avgRpe } as WorkoutSession);
        const srpeLabel = getSRPELabel(sessionSrpe);

        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, type: 'spring' }}
                className="fixed inset-0 z-50 flex flex-col bg-gray-900 text-white p-6 overflow-y-auto no-scrollbar"
            >
                <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500 opacity-20 rounded-full -mr-20 -mt-20 blur-3xl"></div>

                <div className="flex-1 flex flex-col items-center justify-center text-center z-10 shrink-0 min-h-max py-4">
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1, rotate: 360 }}
                        transition={{ delay: 0.2, type: 'spring', bounce: 0.6 }}
                        className="bg-gray-800 p-8 rounded-full mb-8 shadow-2xl shadow-cyan-500/20 border border-gray-700"
                    >
                        <Trophy className="w-20 h-20 text-yellow-400" />
                    </motion.div>
                    <h1 className="text-5xl font-black mb-2 tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-green-400">{t('workout_complete')}</h1>
                    <p className="text-gray-400 mb-12 text-lg">{t('day')} {dayIndex + 1} Done.</p>

                    <div className="grid grid-cols-2 gap-3 w-full max-w-md mb-10">
                        {(() => {
                            const zavorraVolume = Object.values(allLogs).flat().filter(l => l.completed).reduce((acc, l) => {
                                const ex = exercises[l.exerciseId];
                                if (ex && normalizeEquipment(ex.equipment) === Equipment.BODYWEIGHT) {
                                    return acc + (l.weight * l.reps * (ex.isUnilateral ? 2 : 1));
                                }
                                return acc;
                            }, 0);
                            const hasOnlyBodyweight = Object.values(allLogs).flat().filter(l => l.completed).every(l => {
                                const ex = exercises[l.exerciseId];
                                return ex && normalizeEquipment(ex.equipment) === Equipment.BODYWEIGHT;
                            });

                            return (
                                <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="glass-card p-4 rounded-3xl flex flex-col items-center justify-center transition-all duration-300">
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                                        {hasOnlyBodyweight ? t('zavorra_total_label') : t('volume')}
                                    </p>
                                    <p className="text-xl font-black text-white">
                                        {hasOnlyBodyweight ? zavorraVolume : sessionVolume} <span className="text-[10px] text-gray-500 font-medium px-1">{t('kg')}</span>
                                    </p>
                                    {!hasOnlyBodyweight && zavorraVolume > 0 && (
                                        <p className="text-[9px] text-gray-500 mt-1">di cui Zavorra: {zavorraVolume}kg</p>
                                    )}
                                </motion.div>
                            );
                        })()}
                        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="glass-card p-4 rounded-3xl flex flex-col items-center justify-center transition-all duration-300">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">{t('total_sets')}</p>
                            <p className="text-xl font-black text-white">{setsCompleted}</p>
                        </motion.div>
                        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }} className="glass-card p-4 rounded-3xl flex flex-col items-center justify-center relative overflow-hidden transition-all duration-300">
                            <div className="absolute top-0 right-0 w-8 h-8 bg-orange-500/20 rounded-bl-xl"></div>
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Avg RPE</p>
                            <p className="text-xl font-black text-orange-400 flex items-center gap-1">
                                {avgRpe} <Flame className="w-3 h-3 text-orange-500 fill-current" />
                            </p>
                        </motion.div>
                        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }} className={`p-4 rounded-3xl border flex flex-col items-center justify-center relative overflow-hidden ${srpeLabel.color.replace('text-', 'border-').replace('bg-', 'text-')} bg-gray-900 shadow-inner`}>
                            <div className={`absolute inset-0 opacity-10 ${srpeLabel.color.split(' ')[1]}`}></div>
                            <p className="text-[9px] font-bold uppercase tracking-widest mb-1 opacity-70">sRPE Load</p>
                            <p className="text-xl font-black z-10">{Math.round(sessionSrpe)}</p>
                            <span className="text-[9px] font-bold mt-1 opacity-90 z-10 border-t border-current pt-1">{t(srpeLabel.labelKey)}</span>
                        </motion.div>
                    </div>

                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="w-full max-w-xs space-y-3">
                        <Button variant="primary" onClick={() => setShowSocialPreview(true)} className="w-full bg-indigo-500 hover:bg-indigo-400 text-white border-none font-black rounded-2xl py-4 shadow-lg shadow-indigo-500/30">
                            <Share2 className="w-5 h-5 mr-2 inline" /> {t('share_social')}
                        </Button>
                        {isTodaySession && (
                            <Button variant="secondary" onClick={() => setIsComplete(false)} className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 border-none font-bold rounded-2xl py-4">
                                {t('edit_workout')}
                            </Button>
                        )}
                        <Button variant="secondary" onClick={onExit} className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 border-none font-bold rounded-2xl py-4">
                            <Home className="w-5 h-5 mr-2 inline" /> {t('return_home')}
                        </Button>
                        {currentSessionId && isTodaySession && (
                            <button
                                onClick={handleCleanupSession}
                                disabled={isCleaningUp}
                                className="w-full text-center py-3 text-xs text-gray-600 hover:text-red-400 transition-colors font-bold uppercase tracking-wider disabled:opacity-40"
                            >
                                {isCleaningUp ? '⏳ Pulizia in corso...' : '🧹 Ripristina dati sessione'}
                            </button>
                        )}
                    </motion.div>
                </div>

                {/* Social Preview Modal */}
                {showSocialPreview && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
                        <div className="w-full max-w-sm flex flex-col items-center max-h-full overflow-y-auto no-scrollbar py-4">
                            {/* The "Image" to be exported (Fixed Dimensions for Canvas stability) */}
                            <div id="social-share-card" className="relative shrink-0 w-[300px] h-[533px] rounded-[2rem] overflow-hidden shadow-2xl bg-gray-900 border border-gray-700/50 flex flex-col text-white p-6">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/30 rounded-full blur-[80px] -mr-20 -mt-20"></div>
                                <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-[80px] -ml-20 -mb-20"></div>

                                {/* QR Code Graphic */}
                                <div className="absolute bottom-5 right-5 p-1 bg-white rounded-xl shadow-xl transform rotate-[4deg] border border-gray-100 z-20">
                                    <img
                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : 'https://vibegym.app')}`}
                                        alt="QR"
                                        className="w-10 h-10"
                                        crossOrigin="anonymous"
                                    />
                                    <p className="text-[6px] font-black text-center text-gray-900 mt-1 uppercase tracking-widest leading-none">{t('scan_app')}</p>
                                </div>

                                <div className="relative z-10 flex-1 flex flex-col">
                                    <div className="flex items-center gap-2 mb-8">
                                        <div className="w-8 h-8 rounded-lg bg-cyan-500 flex items-center justify-center">
                                            <Dumbbell className="w-5 h-5 text-gray-900" />
                                        </div>
                                        <span className="font-black tracking-widest uppercase text-sm">Vibe Gym</span>
                                    </div>

                                    <div className="mt-auto mb-auto">
                                        <p className="text-cyan-400 font-bold tracking-widest uppercase text-xs mb-2">{t('workout_completed')}</p>
                                        <h2 className="text-4xl font-black leading-tight mb-4">{user.name}</h2>

                                        <div className="space-y-3 relative z-10">
                                            <div className="bg-gray-800/50 backdrop-blur-md p-4 rounded-2xl border border-gray-700/50 flex justify-between items-center">
                                                <span className="text-gray-400 text-xs font-bold uppercase">{t('total_volume')}</span>
                                                <span className="text-xl font-black text-cyan-400">{sessionVolume} {t('kg')}</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-gray-800/50 backdrop-blur-md p-4 rounded-2xl border border-gray-700/50">
                                                    <span className="text-gray-400 text-[10px] font-bold uppercase block mb-1">{t('sets')}</span>
                                                    <span className="text-lg font-black">{setsCompleted}</span>
                                                </div>
                                                <div className="bg-gray-800/50 backdrop-blur-md p-4 rounded-2xl border border-gray-700/50">
                                                    <span className="text-gray-400 text-[10px] font-bold uppercase block mb-1">{t('intensity')}</span>
                                                    <span className="text-lg font-black text-orange-400">{avgRpe} RPE</span>
                                                </div>
                                            </div>
                                            <div className="bg-gray-800/50 backdrop-blur-md p-4 rounded-2xl border border-gray-700/50 flex justify-between items-center">
                                                <span className="flex items-center gap-1.5 text-gray-400 text-xs font-bold uppercase">
                                                    <Clock className="w-3.5 h-3.5" /> {t('time')}
                                                </span>
                                                <span className="text-xl font-black">{timeElapsedStr}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-8 text-center">
                                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{displayDate}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 flex gap-3 w-full max-w-[300px]">
                                <Button variant="secondary" onClick={() => setShowSocialPreview(false)} className="flex-1 rounded-2xl border-none bg-gray-800 text-white">{t('close')}</Button>
                                <Button variant="primary" disabled={isDownloading} onClick={handleDownloadImage} className="flex-1 rounded-2xl border-none bg-cyan-500 text-gray-900 font-bold">
                                    {isDownloading ? t('generating') : t('share')}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </motion.div>
        );
    }

    // --- LOGGING VIEW ---
    if (loading) return <div className="p-6 text-center text-gray-500 h-full flex items-center justify-center bg-gray-900">{t('loading')}</div>;

    if (items.length === 0) return (
        <div className="p-6 text-center mt-10 bg-gray-900 text-white h-full">
            <p className="text-gray-500 mb-4">{t('no_exercises_day')} {dayIndex + 1}.</p>
            <Button onClick={onExit}>{t('previous')}</Button>
        </div>
    );

    const currentItem = items[activeItemIndex];
    const currentExercise = currentItem ? exercises[currentItem.exerciseId] : null;

    if (!currentItem || !currentExercise) return <div className="p-6 bg-gray-900 text-white h-full">{t('error_loading_exercise')}</div>;

    const isTimeBased = currentExercise.measurement === 'time';
    const isBodyweight = normalizeEquipment(currentExercise.equipment) === Equipment.BODYWEIGHT;
    const isUnilateral = !!currentExercise.isUnilateral;
    const isInSuperset = !!currentItem.supersetGroup;
    const supersetGroupItems = isInSuperset
        ? items.filter(i => i.supersetGroup === currentItem.supersetGroup)
        : [];

    return (
        <>
        <div id="workout-logger-container" className="flex flex-col h-full bg-gray-900 text-gray-50 relative overflow-hidden">
            {/* Animation Styles */}
            <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(10px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-slide {
          animation: slideIn 0.3s ease-out;
        }
      `}</style>

            {/* Timer Overlay now lives in App.tsx globally */}

            {/* Crash Recovery Toast */}
            {restoredFromCheckpoint && (
                <div className="absolute top-16 left-4 right-4 z-[60] bg-green-600/95 backdrop-blur text-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl animate-slide-up">
                    <span className="text-xl">🔄</span>
                    <div>
                        <p className="text-sm font-bold">Allenamento ripristinato</p>
                        <p className="text-xs text-green-200">Sei tornato dove avevi lasciato.</p>
                    </div>
                </div>
            )}

            {/* SUPERSET Transition Overlay */}
            {supersetTransition && (
                <div className="absolute inset-0 bg-black z-[70] flex flex-col items-center justify-center animate-fade-in">
                    <style>{`
                @keyframes supersetPulse {
                  0%, 100% { opacity: 1; transform: scale(1); }
                  50% { opacity: 0.7; transform: scale(1.05); }
                }
                @keyframes supersetBar {
                  from { width: 0%; }
                  to { width: 100%; }
                }
              `}</style>
                    <div className="flex items-center gap-3 mb-6" style={{ animation: 'supersetPulse 0.9s ease-in-out infinite' }}>
                        <Link2 className="w-10 h-10 text-red-500" />
                        <h1 className="text-5xl font-black text-red-500 tracking-tighter">{t('superset')}</h1>
                    </div>
                    <p className="text-gray-500 text-sm font-bold uppercase tracking-widest mb-8">{t('switch_now')}</p>
                    <div className="w-48 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-red-500 rounded-full"
                            style={{ animation: `supersetBar ${SUPERSET_CONFIG.TRANSITION_MS}ms linear forwards` }}
                        />
                    </div>
                </div>
            )}

            {/* Missing Bodyweight Banner */}
            {isBodyweight && (!user.weight || user.weight === 0) && (
                <div className="bg-amber-900/60 border-l-4 border-amber-500 text-amber-200 p-3 mx-4 mt-2 mb-2 rounded-r-xl shadow-lg flex items-start gap-3 animate-fade-in text-xs z-10">
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <p>{t('bodyweight_missing_banner')}</p>
                </div>
            )}

            {/* Info Modal Overlay */}
            {showInfo && (
                <div className="absolute inset-0 bg-black/80 z-[60] flex items-center justify-center p-6 animate-fade-in backdrop-blur-sm">
                    <div className="glass-panel rounded-3xl p-6 shadow-2xl w-full max-w-sm relative">
                        <button onClick={() => setShowInfo(false)} className="absolute top-4 right-4 p-2 bg-gray-700 rounded-full hover:bg-gray-600 transition-colors">
                            <X className="w-5 h-5 text-white" />
                        </button>
                        <div className="w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center mb-4">
                            <Dumbbell className="w-6 h-6 text-cyan-400" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">{currentExercise.name}</h3>
                        <div className="flex flex-wrap gap-2 mb-4">
                            <span className="text-[10px] font-bold uppercase bg-gray-700 px-2 py-1 rounded text-gray-300 border border-gray-600">
                                {t('group_' + currentExercise.groupId.replace(' ', '_'))}
                            </span>
                            <span className="text-[10px] font-bold uppercase bg-gray-700 px-2 py-1 rounded text-gray-300 border border-gray-600">
                                {currentExercise.level}
                            </span>
                            <span className="text-[10px] font-bold uppercase bg-blue-900/50 px-2 py-1 rounded text-blue-400 border border-blue-700/50">
                                {currentExercise.equipment}
                            </span>
                            {isUnilateral && (
                                <span className="text-[10px] font-bold uppercase bg-purple-900/50 px-2 py-1 rounded text-purple-400 border border-purple-700/50">
                                    UNILATERALE (Per arto)
                                </span>
                            )}
                        </div>
                        <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700/50 mb-4">
                            <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">{t('description')}</h4>
                            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                                {currentExercise.description}
                            </p>
                        </div>

                        {currentExercise.videoUrl && (
                            <button
                                onClick={() => window.dispatchEvent(new CustomEvent('play-video', { detail: currentExercise.videoUrl }))}
                                className="flex items-center justify-center gap-2 w-full p-4 bg-red-600/20 hover:bg-red-600/30 border border-red-500/50 rounded-xl text-red-400 font-bold transition-colors group"
                            >
                                <Video className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                {t('watch_video')}
                            </button>
                        )}

                        <Button fullWidth onClick={() => setShowInfo(false)} className="mt-4 bg-gray-700 hover:bg-gray-600 text-white border-transparent">
                            {t('close')}
                        </Button>
                    </div>
                </div>
            )}

            {/* Modern Header */}
            <div className="flex items-center p-4 pt-6 shrink-0 glass-panel z-10 relative">
                <button onClick={onExit} className="p-3 -ml-2 hover:bg-gray-800 rounded-full transition-colors">
                    <ChevronLeft className="w-6 h-6 text-gray-400" />
                </button>
                <div className="ml-2 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-2xl font-black text-white leading-none tracking-tight line-clamp-1">{currentExercise.name}</h2>
                        {lastSessionLogs.length > 0 && Math.max(...lastSessionLogs.map(l => l.weight)) > 0 && (
                            <span className="bg-yellow-500/20 text-yellow-400 text-[10px] px-2 py-0.5 rounded border border-yellow-500/30 font-bold whitespace-nowrap">
                                PR: {Math.max(...lastSessionLogs.map(l => l.weight))}
                            </span>
                        )}
                    </div>
                    {currentItem.supersetGroup && (
                        <div className="flex items-center gap-1.5 mb-1">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${getGroupColor(currentItem.supersetGroup).badge} flex items-center gap-1`}>
                                <Link2 className="w-2.5 h-2.5" /> Superset {currentItem.supersetGroup}
                            </span>
                            {items[activeItemIndex + 1]?.supersetGroup === currentItem.supersetGroup && (
                                <span className="text-[10px] text-red-400 font-bold">{t('next_switch')}</span>
                            )}
                        </div>
                    )}
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{t('day')} {currentItem.dayIndex + 1} • {activeItemIndex + 1}/{items.length}</p>
                </div>
                <button
                    onClick={() => setShowInfo(true)}
                    className="p-3 hover:bg-gray-800 rounded-full transition-colors bg-gray-800/50"
                >
                    <Info className="w-5 h-5 text-gray-400" />
                </button>
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={activeItemIndex}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="flex-1 overflow-y-auto px-4 pb-32"
                >

                    {isInSuperset ? (
                        <SupersetCard
                            groupItems={supersetGroupItems}
                            exercises={exercises}
                            allLogs={allLogs}
                            userId={user.uid}
                            workoutId={workout.id}
                            completedRounds={supersetRoundTracker[currentItem.supersetGroup!] ?? 0}
                            onRoundComplete={(newLogs) => {
                                setAllLogs(newLogs);
                                setSupersetRoundTracker(prev => ({
                                    ...prev,
                                    [currentItem.supersetGroup!]: (prev[currentItem.supersetGroup!] ?? 0) + 1
                                }));
                            }}
                            onGroupComplete={(newLogs) => {
                                setAllLogs(newLogs);
                                // Salta tutti gli elementi del superset per andare al prossimo gruppo/esercizio
                                const firstIndexOfGroup = items.findIndex(i => i.supersetGroup === currentItem.supersetGroup);
                                const nextIdx = firstIndexOfGroup > -1 ? firstIndexOfGroup + supersetGroupItems.length : activeItemIndex + supersetGroupItems.length;
                                if (nextIdx < items.length) {
                                    setActiveItemIndex(nextIdx);
                                } else {
                                    setIsComplete(true);
                                }
                            }}
                            onSessionStatsUpdate={(volume, sets, rpeSum) => {
                                setSessionVolume(prev => prev + volume);
                                setSetsCompleted(prev => prev + sets);
                                setSessionRpeSum(prev => prev + rpeSum);
                            }}
                            persistSession={persistSessionState}
                        />
                    ) : (
                        <>
                            {/* Info Pill */}

                    <div className="flex gap-3 mb-6">
                        <div className="glass-card px-4 py-2 rounded-xl flex-1 flex flex-col justify-center transition-all duration-300">
                            <span className="text-[10px] font-bold text-gray-500 uppercase">{t('target')}</span>
                            <span className="text-lg font-bold text-white">
                                {currentItem.sets} x {currentItem.reps}{isTimeBased ? 's' : ''}
                            </span>
                        </div>
                        <div className="glass-card px-3 py-2 rounded-xl flex-1 flex items-center justify-between transition-all duration-300">
                            <div className="flex flex-col justify-center text-right flex-1">
                                <span className="text-[10px] font-bold text-gray-500 uppercase">{t('rest')}</span>
                                <span className="text-lg font-bold text-cyan-400">{currentItem.restSeconds}s</span>
                            </div>
                            <button
                                onClick={handleManualTimer}
                                className="ml-3 p-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-cyan-400 border border-gray-600 transition-colors z-20"
                                title="Start Timer"
                            >
                                <Clock className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* LAST SESSION LOGS DISPLAY - COMPACT ROW */}
                    {lastSessionLogs.length > 0 && (
                        <div className="mb-6">
                            <h3 className="text-[10px] font-bold text-gray-500 uppercase mb-2 flex items-center gap-1.5 px-1">
                                <History className="w-3 h-3" /> {t('last_session')} ({formatToLocaleDate(lastSessionLogs[0].date)})
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {lastSessionLogs.map((log, i) => (
                                    <div key={log.id} className="flex items-center gap-2 bg-gray-800/60 border border-gray-700/60 px-3 py-1.5 rounded-lg">
                                        <span className="text-[10px] font-bold text-gray-500">#{i + 1}</span>
                                        <span className="text-gray-300 font-bold text-xs">
                                            {log.weight}kg <span className="text-gray-600 font-normal">x</span> {log.reps}{isTimeBased ? 's' : ''}
                                        </span>
                                        {log.note && <MessageSquare className="w-2.5 h-2.5 text-blue-400" />}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* WARM-UP RAMP BANNER */}
                    {warmupSets.length > 0 && !warmupDismissed && !isTimeBased && (
                        <div className="mb-6">
                            {warmupCollapsed ? (
                                <button
                                    onClick={() => setWarmupCollapsed(false)}
                                    className="w-full bg-orange-900/30 border border-orange-500/30 rounded-2xl p-3 flex justify-between items-center group transition"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl">🔥</span>
                                        <span className="text-xs font-bold text-orange-400">
                                            Warm-Up RAMP — {warmupSets.length} serie
                                        </span>
                                    </div>
                                    <span className="text-[10px] font-bold text-orange-600/50 group-hover:text-orange-400 transition-colors uppercase tracking-wider">Espandi ▸</span>
                                </button>
                            ) : (
                                <div className="bg-gradient-to-br from-orange-900/30 to-red-900/30 border border-orange-500/30 rounded-2xl p-4 shadow-[0_0_20px_rgba(249,115,22,0.08)] relative overflow-hidden">
                                    <div className="flex justify-between items-center mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg bg-orange-500/20 p-1.5 rounded-lg border border-orange-500/30">🔥</span>
                                            <div>
                                                <h3 className="font-black text-orange-400 text-xs tracking-widest uppercase">RAMP Warm-Up</h3>
                                                <p className="text-[10px] text-orange-700">Basato su {lastSessionLogs[0]?.weight || 0}kg sessione precedente</p>
                                            </div>
                                        </div>
                                        <button onClick={() => setWarmupDismissed(true)} className="p-1.5 bg-gray-900/50 rounded-full hover:bg-gray-800 transition text-gray-500 hover:text-white">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {warmupSets.map((s, i) => (
                                            <div key={i} className="flex items-center gap-3 bg-gray-900/50 rounded-xl px-3 py-2">
                                                <span className="w-5 h-5 rounded-full bg-orange-900/50 border border-orange-700 text-orange-400 text-[10px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                                                <div className="flex-1 flex items-center justify-between">
                                                    <div className="flex flex-col">
                                                        <span className="text-white font-black text-sm">{s.weight}kg</span>
                                                        {s.delta && s.delta.message && (
                                                            <span className="text-[10px] text-gray-400 font-medium">{s.delta.message}</span>
                                                        )}
                                                    </div>
                                                    <span className="text-gray-400 text-xs">×{s.reps}</span>
                                                    <span className="text-orange-500 text-[10px] font-bold">{s.percentLabel}</span>
                                                    <span className="text-gray-600 text-[10px]">{s.label}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* PROGRESSIVE OVERLOAD BADGE */}
                    {overloadSuggestion && (
                        <div className="mb-6 relative">
                            {badgeCollapsed ? (
                                <button 
                                  onClick={() => setBadgeCollapsed(false)}
                                  className="w-full bg-cyan-900/30 border border-cyan-500/30 rounded-2xl p-3 flex justify-between items-center group transition"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-xl">🤖</span>
                                    <span className="text-xs font-bold text-cyan-400">AI Coach: {t('ai_coach_try') || 'Prova'} {overloadSuggestion.suggestedWeight} kg</span>
                                  </div>
                                  <span className="text-[10px] font-bold text-cyan-600/50 group-hover:text-cyan-400 transition-colors uppercase tracking-wider">Espandi ▸</span>
                                </button>
                            ) : (
                                <div className="bg-gradient-to-br from-cyan-900/40 to-blue-900/40 border border-cyan-500/30 rounded-2xl p-5 shadow-[0_0_20px_rgba(34,211,238,0.1)] relative overflow-hidden">
                                    <div className="absolute -top-4 -right-4 opacity-10 pointer-events-none">
                                        <Trophy className="w-24 h-24 text-cyan-400" />
                                    </div>
                                    <div className="flex items-center gap-2 mb-3 relative z-10">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl bg-cyan-500/20 p-1.5 rounded-lg border border-cyan-500/30">🤖</span>
                                            <h3 className="font-black text-cyan-400 text-sm tracking-widest uppercase">AI Coach</h3>
                                        </div>
                                        <button onClick={() => setBadgeCollapsed(true)} className="p-1.5 bg-gray-900/50 rounded-full hover:bg-gray-800 transition text-gray-400 hover:text-white ml-auto">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="relative z-10">
                                        <p className="text-gray-300 font-medium text-xs mb-1">{t(overloadSuggestion.captionKey, overloadSuggestion.captionParams)}</p>
                                        <p className="text-cyan-100 text-sm mb-4">{t('apply')} <strong className="text-white text-xl font-black bg-cyan-500/20 px-2 py-0.5 rounded ml-1 border border-cyan-500/30">{overloadSuggestion.suggestedWeight} kg</strong></p>
                                        
                                        {overloadSuggestion.formulaName && (
                                            <div className="mb-4 bg-gray-900/50 p-2.5 rounded-lg border border-gray-700">
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <span className="text-gray-400 text-[10px]">📐</span>
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Formula: {overloadSuggestion.formulaName}</span>
                                                </div>
                                            </div>
                                        )}

                                        <Button variant="primary" onClick={() => { setWeight(overloadSuggestion.suggestedWeight); setBadgeCollapsed(true); }} className="w-full bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-black shadow-lg shadow-cyan-500/20 py-3 rounded-xl border border-cyan-400">
                                            {t('apply')} {overloadSuggestion.suggestedWeight} kg
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* INPUT CARD - THE CORE UI */}
                    <div className="glass-card rounded-3xl p-6 shadow-2xl shadow-black/50 mb-6 glow-primary">

                        {/* WEIGHT STEPPER */}
                        <div className="mb-6">
                            <label className="text-xs font-bold text-gray-400 uppercase mb-3 flex justify-between items-center">
                                <span>
                                    {isBodyweight ? 'ZAVORRA' : t('weight')} ({t('kg')})
                                    {isUnilateral && <span className="ml-1 normal-case text-purple-400 opacity-80">(per arto)</span>}
                                </span>
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-600">Prev: {lastSessionLogs[0]?.weight || 0}kg</span>
                                    <button
                                        onClick={() => setShowPlateCalc(true)}
                                        className="p-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-cyan-400 border border-gray-600 transition-colors"
                                        title="Plate Calculator"
                                    >
                                        🔧
                                    </button>
                                </div>
                            </label>
                            <div className="flex items-center gap-4">
                                <button onClick={() => adjustWeight(-2.5)} className="w-14 h-14 rounded-2xl bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-300 active:scale-95 transition-all">
                                    <Minus className="w-6 h-6" />
                                </button>
                                <div className="flex-1 bg-gray-900 h-14 rounded-2xl border border-gray-700 flex items-center justify-center relative">
                                    <input
                                        type="number"
                                        min="0"
                                        max="1000"
                                        step="0.5"
                                        id="set-weight"
                                        value={weight || ''}
                                        onChange={(e) => { setWeight(Number(e.target.value)); setIsDirty(true); }}
                                        className="w-full bg-transparent text-white text-5xl font-black text-center focus:outline-none placeholder-gray-700"
                                    />
                                </div>
                                <button onClick={() => adjustWeight(2.5)} className="w-14 h-14 rounded-2xl bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-300 active:scale-95 transition-all">
                                    <Plus className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        {/* REPS/TIME STEPPER */}
                        <div className="mb-8">
                            <label className="text-xs font-bold text-gray-400 uppercase mb-3 block flex justify-between">
                                <span>{isTimeBased ? t('time_seconds') : t('reps')}</span>
                                <span className="text-gray-600">{t('target')}: {currentItem.reps}{isTimeBased ? 's' : ''}</span>
                            </label>
                            <div className="flex items-center gap-4">
                                <button onClick={() => adjustReps(isTimeBased ? -5 : -1)} className="w-14 h-14 rounded-2xl bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-300 active:scale-95 transition-all">
                                    <Minus className="w-6 h-6" />
                                </button>
                                <div className="flex-1 bg-gray-900 h-14 rounded-2xl border border-gray-700 flex items-center justify-center relative">
                                    <input
                                        type="number"
                                        min="0"
                                        max="10000"
                                        step="1"
                                        id="set-reps"
                                        value={reps || ''}
                                        onChange={(e) => { setReps(Number(e.target.value)); setIsDirty(true); }}
                                        className="w-full bg-transparent text-white text-5xl font-black text-center focus:outline-none placeholder-gray-700"
                                    />
                                </div>
                                <button onClick={() => adjustReps(isTimeBased ? 5 : 1)} className="w-14 h-14 rounded-2xl bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-300 active:scale-95 transition-all">
                                    <Plus className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        {/* RPE SLIDER */}
                        <div className="mb-6 bg-gray-900/50 p-4 rounded-2xl border border-gray-700/50">
                            <div className="flex justify-between items-center mb-4">
                                <label className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                                    <Flame className="w-3 h-3 text-orange-500" /> {t('rpe_effort')}
                                </label>
                                <span className={`text-xs font-bold ${getRpeColor(rpe)}`}>
                                    {rpe} - {getRpeLabel(rpe)}
                                </span>
                            </div>
                            <input
                                type="range"
                                min="1"
                                max="10"
                                step="0.5"
                                value={rpe}
                                onChange={(e) => { setRpe(parseFloat(e.target.value)); setIsDirty(true); }}
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                            />
                            <div className="flex justify-between text-[8px] text-gray-600 font-bold mt-2 uppercase">
                                <span>{t('easy')}</span>
                                <span>{t('max')}</span>
                            </div>
                        </div>

                        <Button fullWidth size="lg" onClick={handleLogSet} className="bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-black rounded-2xl py-4 shadow-[0_0_20px_rgba(34,211,238,0.3)]">
                            {t('log_set')} {(allLogs[currentItem.exerciseId] ?? []).length + 1}
                        </Button>

                    </div>

                    {/* CURRENT LOGS LIST */}
                    <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-cyan-500" /> {t('current_session')}
                    </h3>
                    <div className="space-y-3">
                        {(allLogs[currentItem.exerciseId] ?? []).length === 0 && (
                            <div className="p-4 rounded-xl border border-gray-800 text-center text-xs text-gray-600 italic">
                                {t('no_sets_logged')}
                            </div>
                        )}
                        {(allLogs[currentItem.exerciseId] ?? []).slice().reverse().map((log, i) => {
                            const allItemLogs = allLogs[currentItem.exerciseId] ?? [];
                            const originalIndex = allItemLogs.length - 1 - i;
                            return (
                                <div key={log.id} className="flex items-center justify-between p-4 glass-card rounded-2xl animate-slide-up transition-all duration-300 hover:scale-[1.01] hover:shadow-xl">
                                    <div className="flex items-center gap-4">
                                        <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-400 text-xs font-bold border border-green-500/20">
                                            {log.seriesNo}
                                        </div>
                                        <div>
                                            <p className="text-white font-bold text-lg leading-none">
                                                {log.weight}kg <span className="text-gray-500 text-sm">x</span> {log.reps}{isTimeBased ? 's' : ''}
                                            </p>
                                            {log.note && <p className="text-xs text-gray-500 mt-1">{log.note}</p>}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteLog(originalIndex)}
                                        className="p-2 rounded-xl transition-colors text-red-400 hover:bg-red-500/10"
                                        title={t('delete_set')}
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                        </>
                    )}

                </motion.div>
            </AnimatePresence>

            {/* Navigation Footer */}
            {!isInSuperset && (
            <div className="p-4 border-t border-gray-800 glass-panel grid grid-cols-2 gap-4 shrink-0 z-20 absolute bottom-0 w-full">
                <Button
                    variant="secondary"
                    className="bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700"
                    disabled={activeItemIndex === 0}
                    onClick={() => {
                        const count = activeItemIndex - 1;
                        if (count >= 0) {
                            const prevItem = items[count];
                            if (prevItem && prevItem.supersetGroup) {
                                const groupFirstIdx = items.findIndex(i => i.supersetGroup === prevItem.supersetGroup);
                                setActiveItemIndex(groupFirstIdx > -1 ? groupFirstIdx : count);
                            } else {
                                setActiveItemIndex(count);
                            }
                        }
                    }}
                >
                    {t('previous')}
                </Button>
                <Button
                    onClick={handleNextExercise}
                    className={activeItemIndex === items.length - 1 ? 'bg-green-500 hover:bg-green-400 text-gray-900 font-bold' : 'bg-gray-800 text-white border-gray-700 hover:bg-gray-700'}
                >
                    {activeItemIndex === items.length - 1 ? t('finish_workout') : t('next_exercise')}
                </Button>
            </div>
            )}
        </div>

        {/* PLATE CALCULATOR MODAL */}
        {showPlateCalc && (
            <PlateCalculator
                targetWeight={weight || lastSessionLogs[0]?.weight || 20}
                onClose={() => setShowPlateCalc(false)}
                equipment={currentExercise?.equipment}
            />
        )}
    </>
    );
};
