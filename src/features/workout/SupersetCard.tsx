import React, { useState, useEffect, useRef } from 'react';
import { WorkoutItem, Exercise, Log } from '../../types';
import { getGroupColor } from '../../core/domain/supersetLogic';
import { Minus, Plus, CheckCircle, Clock, Flame } from 'lucide-react';
import { Button } from '../../components/Button';
import { LogsRepository } from '../../repositories';


// ─── RPE HELPERS ──────────────────────────────────────────────────────────────
const getRpeColor = (val: number) => {
  if (val <= 4) return 'text-green-400';
  if (val <= 7) return 'text-yellow-400';
  return 'text-red-500';
};
const getRpeLabel = (val: number) => {
  if (val <= 4) return 'Easy';
  if (val <= 6) return 'Moderate';
  if (val <= 8) return 'Hard';
  return 'Max Effort';
};

// ─── REST TIMER (interno a SupersetCard) ──────────────────────────────────────
const InlineRestTimer: React.FC<{ seconds: number; onComplete: () => void }> = ({ seconds, onComplete }) => {
  const [remaining, setRemaining] = useState(seconds);
  const cbRef = useRef(onComplete);
  cbRef.current = onComplete;

  useEffect(() => {
    if (remaining <= 0) { cbRef.current(); return; }
    const id = setInterval(() => setRemaining(p => p - 1), 1000);
    return () => clearInterval(id);
  }, [remaining]);

  const pct = Math.round(((seconds - remaining) / seconds) * 100);
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <div className="bg-gray-900/70 border border-gray-700 rounded-2xl p-4 mt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-bold text-gray-400 uppercase">Riposo tra round</span>
        </div>
        <span className="font-black text-cyan-400 text-lg tabular-nums">
          {mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${remaining}s`}
        </span>
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-cyan-500 rounded-full transition-all duration-1000"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

// ─── SUB-CARD: esercizio già loggato ──────────────────────────────────────────
const LoggedSubCard: React.FC<{
  item: WorkoutItem;
  exercise: Exercise | undefined;
  log: Log;
  groupColor: ReturnType<typeof getGroupColor>;
}> = ({ item, exercise, log, groupColor }) => (
  <div className={`flex items-center gap-3 p-3 rounded-xl border ${groupColor.border} bg-gray-900/50`}>
    <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
    <div className="flex-1 min-w-0">
      <p className="font-bold text-white text-sm truncate">{exercise?.name ?? 'Esercizio'}</p>
      <p className="text-xs text-gray-400">
        {log.weight}kg × {log.reps} rep
        {log.rpe ? <span className={`ml-2 font-bold ${getRpeColor(log.rpe)}`}>RPE {log.rpe}</span> : null}
      </p>
    </div>
    <span className="text-green-400 text-xs font-bold">✓</span>
  </div>
);

// ─── SUB-CARD: esercizio in attesa ────────────────────────────────────────────
const PendingSubCard: React.FC<{
  exercise: Exercise | undefined;
}> = ({ exercise }) => (
  <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-700/50 bg-gray-900/20 opacity-50">
    <div className="w-5 h-5 rounded-full border-2 border-gray-600 shrink-0" />
    <p className="font-bold text-gray-500 text-sm truncate">{exercise?.name ?? 'Esercizio'}</p>
    <span className="ml-auto text-gray-600 text-[10px] uppercase font-bold">In attesa</span>
  </div>
);

// ─── SUB-CARD: esercizio attivo ───────────────────────────────────────────────
const ActiveSubCard: React.FC<{
  item: WorkoutItem;
  exercise: Exercise | undefined;
  lastLog: Log | undefined;
  groupColor: ReturnType<typeof getGroupColor>;
  onLog: (itemId: string, exerciseId: string, weight: number, reps: number, rpe: number) => void;
}> = ({ item, exercise, lastLog, groupColor, onLog }) => {
  const [weight, setWeight] = useState(lastLog?.weight ?? 0);
  const [reps, setReps] = useState(lastLog?.reps ?? item.reps);
  const [rpe, setRpe] = useState(lastLog?.rpe ?? 7);
  const isTimeBased = exercise?.measurement === 'time';

  return (
    <div className={`p-4 rounded-2xl border-2 ${groupColor.border} bg-gray-900/80 shadow-lg`}>
      {/* Exercise Name */}
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full ${groupColor.badge.split(' ')[0]} animate-pulse`} />
        <p className="font-black text-white text-sm">{exercise?.name ?? 'Esercizio'}</p>
        {lastLog && (
          <span className="ml-auto text-[10px] text-gray-500 font-bold">
            Prec: {lastLog.weight}kg × {lastLog.reps}
          </span>
        )}
      </div>

      {/* Steppers Row */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* Weight */}
        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Peso (kg)</label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWeight(p => Math.max(0, parseFloat((p - 2.5).toFixed(2))))}
              className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-300 active:scale-95 transition-all"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input
              type="number"
              value={weight || ''}
              onChange={e => setWeight(Number(e.target.value))}
              className="flex-1 bg-gray-800 text-white font-black text-center text-lg h-8 rounded-lg border border-gray-700 focus:outline-none min-w-0"
            />
            <button
              onClick={() => setWeight(p => parseFloat((p + 2.5).toFixed(2)))}
              className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-300 active:scale-95 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Reps/Time */}
        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">
            {isTimeBased ? 'Tempo (s)' : 'Reps'}
          </label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setReps(p => Math.max(0, p - (isTimeBased ? 5 : 1)))}
              className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-300 active:scale-95 transition-all"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input
              type="number"
              value={reps || ''}
              onChange={e => setReps(Number(e.target.value))}
              className="flex-1 bg-gray-800 text-white font-black text-center text-lg h-8 rounded-lg border border-gray-700 focus:outline-none min-w-0"
            />
            <button
              onClick={() => setReps(p => p + (isTimeBased ? 5 : 1))}
              className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-300 active:scale-95 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* RPE Slider */}
      <div className="mb-3 bg-gray-800/60 rounded-xl p-3">
        <div className="flex justify-between items-center mb-2">
          <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1">
            <Flame className="w-3 h-3 text-orange-500" /> RPE
          </label>
          <span className={`text-xs font-bold ${getRpeColor(rpe)}`}>{rpe} — {getRpeLabel(rpe)}</span>
        </div>
        <input
          type="range"
          min="1"
          max="10"
          step="0.5"
          value={rpe}
          onChange={e => setRpe(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
        />
      </div>

      {/* Log Button */}
      <Button
        onClick={() => onLog(item.id, item.exerciseId, weight, reps, rpe)}
        disabled={reps === 0}
        className="w-full bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-black py-2.5 rounded-xl text-sm border border-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Logga {exercise?.name?.split(' ')[0] ?? 'Set'}
      </Button>
    </div>
  );
};

// ─── SUPERSET CARD PRINCIPALE ─────────────────────────────────────────────────
export interface SupersetCardProps {
  groupItems: WorkoutItem[];
  exercises: Record<string, Exercise>;
  allLogs: Record<string, Log[]>;
  userId: string;
  workoutId: string;
  completedRounds: number;
  onRoundComplete: (logs: Record<string, Log[]>) => void;
  onGroupComplete: (logs: Record<string, Log[]>) => void;
  onSessionStatsUpdate: (volume: number, sets: number, rpeSum: number) => void;
  persistSession: () => void;
}

export const SupersetCard: React.FC<SupersetCardProps> = ({
  groupItems,
  exercises,
  allLogs,
  userId,
  workoutId,
  completedRounds,
  onRoundComplete,
  onGroupComplete,
  onSessionStatsUpdate,
  persistSession,
}) => {
  const group = groupItems[0]?.supersetGroup ?? 'A';
  const targetSets = groupItems[0]?.sets ?? 3;
  const groupColor = getGroupColor(group);

  // Indice del sub-esercizio attualmente attivo (0 = primo, -1 = tutti loggati → timer)
  const [activeSubIndex, setActiveSubIndex] = useState(0);
  // Log locali del round corrente (resettati ad ogni round)
  const [localLogs, setLocalLogs] = useState<Record<string, Log[]>>({ ...allLogs });
  const [showTimer, setShowTimer] = useState(false);

  // Sincronizza i log dal parent quando cambia il round
  useEffect(() => {
    setLocalLogs({ ...allLogs });
    setActiveSubIndex(0);
    setShowTimer(false);
  }, [completedRounds]);

  const handleSubLog = async (
    itemId: string,
    exerciseId: string,
    weight: number,
    reps: number,
    rpe: number
  ) => {
    if (reps === 0) return;

    const currentLogsForEx = localLogs[exerciseId] ?? [];
    const seriesNo = currentLogsForEx.length + 1;
    const tempId = 'temp_' + Date.now();
    const finalNote = `RPE: ${rpe}`;

    const newLog: Log = {
      id: tempId,
      userId,
      workoutId,
      itemId,
      exerciseId,
      date: new Date().toISOString(),
      seriesNo,
      reps,
      weight,
      completed: true,
      rpe,
      note: finalNote,
    };

    // Aggiorna log locali immediatamente (optimistic)
    const updatedLogs = {
      ...localLogs,
      [exerciseId]: [...currentLogsForEx, newLog],
    };
    setLocalLogs(updatedLogs);

    // Aggiorna statistiche sessione nel parent
    onSessionStatsUpdate(weight * reps, 1, rpe);
    persistSession();

    // Salva su Firebase async
    LogsRepository.logSet({
      userId,
      workoutId,
      itemId,
      exerciseId,
      date: new Date().toISOString(),
      seriesNo,
      reps,
      weight,
      completed: true,
      rpe,
      note: finalNote,
    }).then(savedId => {
      setLocalLogs(prev => ({
        ...prev,
        [exerciseId]: (prev[exerciseId] ?? []).map(l => l.id === tempId ? { ...l, id: savedId } : l),
      }));
    }).catch(e => console.error('Failed to log superset set', e));

    // Avanza al prossimo sub-esercizio
    const nextSubIdx = activeSubIndex + 1;
    if (nextSubIdx < groupItems.length) {
      setActiveSubIndex(nextSubIdx);
    } else {
      // Tutti gli esercizi del round loggati
      setActiveSubIndex(-1);
      const roundsDone = completedRounds + 1;

      if (roundsDone >= targetSets) {
        // Superset completato
        onGroupComplete(updatedLogs);
      } else {
        // Mostra timer riposo
        setShowTimer(true);
      }
    }
  };

  const handleTimerComplete = () => {
    setShowTimer(false);
    onRoundComplete(localLogs);
  };

  // Determina per ogni item il log del round corrente
  const getLogForCurrentRound = (exerciseId: string): Log | undefined => {
    return (localLogs[exerciseId] ?? [])[completedRounds];
  };

  const restSeconds = groupItems[0]?.restSeconds ?? 60;

  return (
    <div className={`rounded-3xl border-2 ${groupColor.border} bg-gray-800/80 overflow-hidden`}>
      {/* ── Header ── */}
      <div className={`px-5 py-4 ${groupColor.bg} border-b ${groupColor.border} flex items-center justify-between`}>
        <div className="flex items-center gap-2.5">
          <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest ${groupColor.badge}`}>
            🔗 Superset {group}
          </span>
          <span className="text-[10px] text-gray-400 font-bold">
            {groupItems.length} esercizi
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: targetSets }).map((_, i) => (
            <div
              key={i}
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                i < completedRounds
                  ? 'bg-green-400'
                  : i === completedRounds
                  ? groupColor.badge.split(' ')[0]
                  : 'bg-gray-700'
              }`}
            />
          ))}
          <span className={`ml-1 text-xs font-black ${groupColor.text}`}>
            Round {Math.min(completedRounds + 1, targetSets)}/{targetSets}
          </span>
        </div>
      </div>

      {/* ── Lista Sub-esercizi ── */}
      <div className="p-4 space-y-3">
        {groupItems.map((item, subIdx) => {
          const exercise = exercises[item.exerciseId];
          const roundLog = getLogForCurrentRound(item.exerciseId);
          const isLogged = !!roundLog;
          const isActive = subIdx === activeSubIndex;

          // Per lastLog usiamo il log del round precedente (per pre-popolare gli input)
          const lastLog = (allLogs[item.exerciseId] ?? [])[(completedRounds > 0 ? completedRounds - 1 : 0)];

          if (isLogged) {
            return <LoggedSubCard key={item.id} item={item} exercise={exercise} log={roundLog} groupColor={groupColor} />;
          }
          if (isActive) {
            return (
              <ActiveSubCard
                key={item.id}
                item={item}
                exercise={exercise}
                lastLog={lastLog}
                groupColor={groupColor}
                onLog={handleSubLog}
              />
            );
          }
          return <PendingSubCard key={item.id} exercise={exercise} />;
        })}

        {/* ── Timer Riposo (dopo round completato) ── */}
        {showTimer && restSeconds > 0 && (
          <InlineRestTimer seconds={restSeconds} onComplete={handleTimerComplete} />
        )}

        {/* ── Skip Timer ── */}
        {showTimer && (
          <button
            onClick={handleTimerComplete}
            className="w-full text-xs text-gray-600 hover:text-gray-400 transition py-1"
          >
            Salta riposo →
          </button>
        )}
      </div>
    </div>
  );
};

export default SupersetCard;
