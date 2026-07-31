
import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { User, Exercise, Log, ClientPlanSummary, ClientExerciseSummary, BodyMeasurement, Workout, WorkoutItem, WorkoutSession } from '../../types';
import { Log as DomainLog, resolveBodyweight } from '../../core/domain';
import { Equipment } from '../../core/domain/Equipment';

import { Users, ClipboardList, Plus, Dumbbell, Calendar, X, ChevronLeft, Settings, TrendingUp, Activity, RotateCcw, Check, Trophy, BarChart3, List, Ruler, Trash2, MessageSquare, Edit2, FolderOpen, AlertCircle, ChevronRight, Video, ExternalLink, Clock, Pencil, ArrowUp, ArrowDown, ChevronDown, ChevronUp, Search, Filter, Link2, Info } from 'lucide-react';
import { getGroupColor, cycleGroup, validateSupersetGroups } from '../../core/domain/supersetLogic';
import { calculate1RMEpley, calculateEstRPE } from '../../core/domain/analytics';
import { EstimatorFactory } from '../../core/domain/estimators';
import { Button } from '../../components/Button';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, ComposedChart, PieChart, Pie } from 'recharts';
import { useTranslation } from '../../services/i18n';
import { getLocalDatePart, getLocalTodayString, getDaysDifference, formatFriendlyDate, formatShortMonthDay, formatShortWeekdayDay, formatShortWeekdayMonthDay, formatToLocaleDate, formatLongDate, toLocalISOString } from '../../date';
import { ThemeToggle } from '../../components/ThemeToggle';
import { motion, AnimatePresence } from 'framer-motion';
import { MeasurementsTrendChart, ACWRChart, MuscleGroupRadarChart } from '../dashboard-client/ClientHome';
import { DashboardSkeleton } from '../../components/Skeleton';
import { UsersRepository, LogsRepository, SessionsRepository, WorkoutsRepository, AuthRepository } from '../../repositories';

interface Props {
  user: User;
}

interface DraftItem {
  exerciseId: string;
  sets: number;
  reps: number;
  restSeconds: number;
  dayIndex: number;
  supersetGroup?: string;
}

// Hierarchy Definition
const MUSCLE_HIERARCHY = [
  {
    key: 'zone_upper',
    groups: ['chest', 'back', 'traps', 'shoulders']
  },
  {
    key: 'zone_arms',
    groups: ['biceps', 'triceps', 'forearms']
  },
  {
    key: 'zone_lower',
    groups: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors']
  },
  {
    key: 'zone_core',
    groups: ['abs', 'obliques', 'lower_back']
  }
];

// --- CLIENT ANALYTICS COMPONENT ---
const ClientAnalytics: React.FC<{
  logs: Log[],
  sessions: WorkoutSession[],
  exercises: Record<string, string>,
  fullExercises?: Record<string, Exercise>,
  clientWeight?: number
}> = ({ logs, sessions, exercises, fullExercises, clientWeight }) => {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);
  const [chartMode, setChartMode] = useState<'volume' | 'strength'>('volume');
  const [selectedExId, setSelectedExId] = useState<string>('');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const chartData = useMemo(() => {
    if (chartMode === 'volume') {
      const dailyVol: Record<string, number> = {};

      // Calculate volume entirely dynamically using logs
      logs.forEach(l => {
        const date = getLocalDatePart(l.date);
        if (!date) return; // Skip if handled by session
        if (l.id?.startsWith('temp_')) return;
        // FIX: Escludi serie saltate (completed=false) dai calcoli raw volume
        if (l.completed === false) return;

        if (!dailyVol[date]) dailyVol[date] = 0;
        const ex = fullExercises?.[l.exerciseId] || { isBodyweight: false, isUnilateral: false };
        const domainLog = new DomainLog(l);
        const logBw = resolveBodyweight(l.bodyweightAtLog, clientWeight);
        dailyVol[date] += domainLog.calculateVolume(ex, logBw);
      });
      return Object.entries(dailyVol)
        .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
        .map(([date, val]) => ({
          date: formatShortMonthDay(date),
          value: val
        }))
        .slice(-10);
    } else {
      if (!selectedExId) return [];
      // FIX: Escludi serie saltate (weight=0/reps=0) dalla progressione di forza
      const exLogs = logs.filter(l => l.exerciseId === selectedExId && l.completed !== false && l.weight > 0 && l.reps > 0);
      const dailyMax: Record<string, { rm: number, realRM: number | null }> = {};

      exLogs.forEach(l => {
        const date = getLocalDatePart(l.date);
        if (!date) return;
        if (!dailyMax[date]) dailyMax[date] = { rm: 0, realRM: null };
        const estimator = EstimatorFactory.getBestEstimator(l.reps);
        const rm = estimator.estimate1RM(l.weight, l.reps);
        if (rm > dailyMax[date].rm) dailyMax[date].rm = rm;
        if (l.reps === 1 && (dailyMax[date].realRM === null || l.weight > dailyMax[date].realRM)) {
          dailyMax[date].realRM = l.weight;
        }
      });

      return Object.entries(dailyMax)
        .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
        .map(([date, val]) => ({
          date: formatShortMonthDay(date),
          value: Math.round(val.rm),
          realRM: val.realRM !== null ? Math.round(val.realRM) : null
        }));
    }
  }, [logs, chartMode, selectedExId]);

  useEffect(() => {
    if (chartMode === 'strength' && !selectedExId) {
      const uniqueExIds = Array.from(new Set(logs.map(l => l.exerciseId)));
      if (uniqueExIds.length > 0) setSelectedExId(uniqueExIds[0]);
    }
  }, [chartMode, logs, selectedExId]);

  const uniqueExercises: string[] = Array.from(new Set(logs.map(l => l.exerciseId)));

  return (
    <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-lg mt-6 transition-colors relative">
      <div className="flex items-start justify-between mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-500" /> {t('general_analytics')}</h3>
          {chartMode === 'strength' && (
            <span className="text-[10px] bg-cyan-500/10 text-cyan-500 dark:text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/20" title="Il grafico dei massimali usa l'AI Dynamic Estimator (seleziona automaticamente Epley, Brzycki o Lombardi in base alle rep per darti la stima più precisa possibile).">
              AI Dynamic Estimator
            </span>
          )}
          <button onClick={() => setShowInfo(true)} className="p-1.5 rounded-full text-gray-400 hover:text-cyan-500 bg-gray-100 dark:bg-gray-700 transition-colors shrink-0">
          <Info className="w-5 h-5" />
        </button>
        </div>
        <div className="flex bg-gray-100 dark:bg-gray-700 p-0.5 rounded-lg">
          <button
            onClick={() => setChartMode('volume')}
            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${chartMode === 'volume' ? 'bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
          >
            {t('volume')}
          </button>
          <button
            onClick={() => setChartMode('strength')}
            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${chartMode === 'strength' ? 'bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
          >
            {t('strength')}
          </button>
        </div>
      </div>

      {chartMode === 'strength' && (
        <div className="mb-4">
          <select
            className="w-full p-2 border dark:border-gray-600 rounded-lg text-sm bg-gray-50 dark:bg-gray-700 dark:text-white"
            value={selectedExId}
            onChange={(e) => setSelectedExId(e.target.value)}
          >
            {uniqueExercises.map((id) => (
              <option key={id} value={id}>{exercises[id] || 'Unknown Exercise'}</option>
            ))}
          </select>
        </div>
      )}

      <div className="h-48 w-full" style={{ minHeight: '192px' }}>
        {!isMounted ? (
          <div className="h-full w-full flex items-center justify-center text-gray-400 text-xs animate-pulse bg-gray-50 dark:bg-gray-900 rounded-xl">
            {t('loading_analytics')}
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-xs">
            {t('not_enough_data')}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            {chartMode === 'volume' ? (
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorVol" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" strokeOpacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', backgroundColor: '#1f2937', color: '#fff' }}
                  itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                  formatter={(value: number) => [`${(value).toLocaleString()} ${t('kg')}`, t('volume')]}
                />
                <Area type="monotone" dataKey="value" stroke="#3b82f6" fillOpacity={1} fill="url(#colorVol)" strokeWidth={3} />
              </AreaChart>
            ) : (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" strokeOpacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', backgroundColor: '#1f2937', color: '#fff' }}
                  itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                  formatter={(val: number, name: string) => {
                    if (name === 'value') return [`${val} ${t('kg')}`, '1RM Stimato (AI)'];
                    if (name === 'realRM') return [`${val} ${t('kg')}`, '1RM Reale'];
                    return [`${val} ${t('kg')}`, name];
                  }}
                />
                <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#1f2937' }} activeDot={{ r: 6, fill: '#10b981' }} connectNulls={true} />
                <Line type="stepAfter" dataKey="realRM" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4, strokeWidth: 2, fill: '#1f2937', stroke: '#ef4444' }} activeDot={{ r: 6, fill: '#ef4444' }} connectNulls={true} />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {/* Info Modal */}
      {typeof window !== 'undefined' && createPortal(
      <AnimatePresence>{showInfo && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 dark:bg-black/80 dark:backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', duration: 0.4 }} className="glass-panel w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-3xl p-6 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-700 pb-3">
              <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2"><Info className="w-5 h-5 text-cyan-500" /> {t('general_analytics')}</h3>
              <button onClick={() => setShowInfo(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400 dark:hover:text-white" /></button>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300 space-y-3">
              <p>{t('info_gen_analytics_desc')}</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>Volume:</strong> {t('info_gen_analytics_v1').replace('Volume: ', '')}</li>
                <li><strong>Strength:</strong> {t('info_gen_analytics_v2').replace('Strength: ', '')}</li>
              </ul>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      , document.body)}
    </div>
  );
}

// --- ADHERENCE BAR CHART (Weekly Consistency) ---
export const AdherenceBarChart: React.FC<{ logs: Log[] }> = ({ logs }) => {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);

  const chartData = useMemo(() => {
    const days = 14;
    const today = new Date();

    const data = [];

    // Find which days have logs
    const activeDaysMap = new Map<string, number>();
    logs.forEach(l => {
      if (l.completed === false || l.id?.startsWith('temp_skip_')) return;
      const ds = getLocalDatePart(l.date);
      if (!ds) return;
      activeDaysMap.set(ds, (activeDaysMap.get(ds) || 0) + 1);
    });

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = getLocalDatePart(d);
      const totalSets = activeDaysMap.get(ds) || 0;

      data.push({
        date: formatShortWeekdayDay(d),
        sets: totalSets,
        trained: totalSets > 0 ? 1 : 0
      });
    }
    return data;
  }, [logs]);

  return (
    <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-lg transition-colors mt-6 relative">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2 text-sm"><Calendar className="w-5 h-5 text-emerald-500" /> {t('consistency_14d')}</h3>
        <button onClick={() => setShowInfo(true)} className="p-1.5 rounded-full text-gray-400 hover:text-cyan-500 bg-gray-100 dark:bg-gray-700 transition-colors shrink-0">
          <Info className="w-5 h-5" />
        </button>
      </div>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.2} />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', backgroundColor: '#1f2937', color: '#fff' }}
              formatter={(value: number, name: string, props: any) => [`${props.payload.sets} sets`, 'Workout Volume']}
              cursor={{ fill: 'rgba(16, 185, 129, 0.1)' }}
            />
            <Bar dataKey="sets" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.sets > 0 ? '#10b981' : '#f3f4f6'}
                  className={entry.sets > 0 ? '' : 'dark:fill-gray-700'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Info Modal */}
      {typeof window !== 'undefined' && createPortal(
      <AnimatePresence>{showInfo && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 dark:bg-black/80 dark:backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', duration: 0.4 }} className="glass-panel w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-3xl p-6 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-700 pb-3">
              <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2"><Info className="w-5 h-5 text-cyan-500" /> {t('consistency')} (Aderenza)</h3>
              <button onClick={() => setShowInfo(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400 dark:hover:text-white" /></button>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300 space-y-3">
              <p>{t('info_consistency_desc')}</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>{t('info_consistency_l1')}</li>
                <li>{t('info_consistency_l2')}</li>
              </ul>
              <p className="italic">{t('info_consistency_end')}</p>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      , document.body)}
    </div>
  );
};

// --- RPE vs VOLUME COMPOSED CHART ---
const RPEVolumeComposedChart: React.FC<{
  logs: Log[],
  exercises: Record<string, string>,
  fullExercises?: Record<string, Exercise>,
  clientWeight?: number
}> = ({ logs, exercises, fullExercises, clientWeight }) => {
  const { t } = useTranslation();
  const [selectedExId, setSelectedExId] = useState<string>('');
  const [showInfo, setShowInfo] = useState(false);

  // Available exercises for dropdown
  const availableExs = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach(l => counts[l.exerciseId] = (counts[l.exerciseId] || 0) + 1);
    return Object.keys(counts).map(id => ({
      id,
      name: exercises[id] || 'Unknown Exercise',
      count: counts[id]
    })).filter(ex => ex.count > 2).sort((a, b) => b.count - a.count);
  }, [logs, exercises]);

  useEffect(() => {
    if (!selectedExId && availableExs.length > 0) {
      setSelectedExId(availableExs[0].id);
    }
  }, [availableExs, selectedExId]);

  const chartData = useMemo(() => {
    if (!selectedExId) return [];

    const exLogs = logs.filter(l => l.exerciseId === selectedExId).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (exLogs.length === 0) return [];

    // 1. Calculate historical max 1RM for this exercise to use as baseline
    let globalMax1RM = 0;
    exLogs.forEach(l => {
      if (!l.weight || !l.reps) return;
      const estimator = EstimatorFactory.getBestEstimator(l.reps);
      const rm = estimator.estimate1RM(l.weight, l.reps);
      if (rm > globalMax1RM) globalMax1RM = rm;
    });

    // Group by Date to show session Volume and Average RPE
    const dailyData: Record<string, { vol: number, reps: number, weightSum: number, sets: number, rpeSum: number }> = {};

    exLogs.forEach(l => {
      // FIX: Escludi serie saltate (reps=0, weight=0) dal calcolo volume e RPE stimato
      if (!l.weight || !l.reps || l.completed === false) return;

      const dateStr = formatShortMonthDay(l.date);
      if (!dailyData[dateStr]) {
        dailyData[dateStr] = { vol: 0, reps: 0, weightSum: 0, sets: 0, rpeSum: 0 };
      }
      const ex = fullExercises?.[l.exerciseId] || { isBodyweight: false, isUnilateral: false };
      const domainLog = new DomainLog(l);
      const logBw = resolveBodyweight(l.bodyweightAtLog, clientWeight);
      dailyData[dateStr].vol += domainLog.calculateVolume(ex, logBw);

      const estRpe = calculateEstRPE(l.weight, l.reps, globalMax1RM);
      dailyData[dateStr].rpeSum += estRpe;
      dailyData[dateStr].sets += 1;
    });

    return Object.entries(dailyData).map(([date, data]) => ({
      date,
      volume: data.vol,
      rpe: data.sets > 0 ? Math.round((data.rpeSum / data.sets) * 10) / 10 : 0 // Avg RPE for the session
    }));
  }, [logs, selectedExId]);

  if (availableExs.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-lg transition-colors mt-6 relative">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2 text-sm"><Activity className="w-5 h-5 text-purple-500" /> {t('fatigue_vs_volume')}</h3>
          <button onClick={() => setShowInfo(true)} className="p-1.5 rounded-full text-gray-400 hover:text-cyan-500 bg-gray-100 dark:bg-gray-700 transition-colors shrink-0">
          <Info className="w-5 h-5" />
        </button>
        </div>
        <select
          value={selectedExId}
          onChange={e => setSelectedExId(e.target.value)}
          className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-xs font-bold rounded-lg p-2 focus:ring-cyan-500 focus:border-cyan-500 w-32 truncate shrink-0"
        >
          {availableExs.map(ex => (
            <option value={ex.id} key={ex.id}>{ex.name}</option>
          ))}
        </select>
      </div>
      <div className="h-48 w-full">
        {chartData.length < 2 ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-xs">{t('not_enough_data_bw')}</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.2} />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" domain={[1, 10]} tick={{ fontSize: 9, fill: '#a855f7' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', backgroundColor: '#1f2937', color: '#fff' }}
                itemStyle={{ fontWeight: 'bold' }}
              />
              <Bar yAxisId="left" dataKey="volume" name="Volume (kg)" fill="#3b82f6" fillOpacity={0.8} radius={[4, 4, 0, 0]} barSize={20} />
              <Line yAxisId="right" type="monotone" dataKey="rpe" name="RPE Stimato" stroke="#a855f7" strokeWidth={3} dot={{ r: 4, fill: '#1f2937', strokeWidth: 2 }} activeDot={{ r: 6, fill: '#a855f7' }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Info Modal */}
      {typeof window !== 'undefined' && createPortal(
      <AnimatePresence>{showInfo && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 dark:bg-black/80 dark:backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', duration: 0.4 }} className="glass-panel w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-3xl p-6 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-700 pb-3">
              <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2"><Info className="w-5 h-5 text-cyan-500" /> {t('fatigue_vs_volume')}</h3>
              <button onClick={() => setShowInfo(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400 dark:hover:text-white" /></button>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300 space-y-3">
              <p>{t('info_fatigue_desc')}</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>{t('info_fatigue_l1')}</li>
                <li>{t('info_fatigue_l2')}</li>
              </ul>
              <p className="italic">{t('info_fatigue_end')}</p>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      , document.body)}
    </div>
  );
};

// --- COMPLETION DONUT CHART ---
const CompletionDonutChart: React.FC<{ logs: Log[] }> = ({ logs }) => {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);

  // Calculate Completion
  const chartData = useMemo(() => {
    if (logs.length === 0) return [];

    let completed = 0;
    let skipped = 0;

    logs.forEach(l => {
      if (l.completed) completed++;
      else skipped++;
    });

    if (completed === 0 && skipped === 0) return [];

    return [
      { name: 'Completed', value: completed, color: '#10b981' }, // emerald-500
      { name: 'Missed/Skipped', value: skipped, color: '#ef4444' }      // red-500
    ];
  }, [logs]);

  const total = chartData.reduce((acc, curr) => acc + curr.value, 0);
  const completedVal = chartData.find(d => d.name === 'Completed')?.value || 0;
  const completionRate = total > 0 ? Math.round((completedVal / total) * 100) : 0;

  if (total === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-lg transition-colors mt-6 relative">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2 text-sm"><Check className="w-5 h-5 text-blue-500" /> {t('completion_rate')}</h3>
        <button onClick={() => setShowInfo(true)} className="p-1.5 rounded-full text-gray-400 hover:text-cyan-500 bg-gray-100 dark:bg-gray-700 transition-colors shrink-0">
          <Info className="w-5 h-5" />
        </button>
      </div>
      <div className="h-40 w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
              stroke="none"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', backgroundColor: '#1f2937', color: '#fff', fontSize: '12px' }}
              itemStyle={{ fontWeight: 'bold' }}
              formatter={(value: number) => [`${value} Sets`, 'Volume']}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center text for Donut */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-3xl font-black text-gray-900 dark:text-white">{completionRate}%</span>
          <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">{t('completed')}</span>
        </div>
      </div>

      {/* Info Modal */}
      {typeof window !== 'undefined' && createPortal(
      <AnimatePresence>{showInfo && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 dark:bg-black/80 dark:backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', duration: 0.4 }} className="glass-panel w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-3xl p-6 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-700 pb-3">
              <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2"><Info className="w-5 h-5 text-cyan-500" /> {t('completion_rate')}</h3>
              <button onClick={() => setShowInfo(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400 dark:hover:text-white" /></button>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300 space-y-3">
              <p>{t('info_completion_desc')}</p>
              <p className="italic">{t('info_completion_end')}</p>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      , document.body)}
    </div>
  );
};

// --- EXERCISE LIBRARY VIEW (Standalone) ---
const ExerciseLibraryView: React.FC<{
  exercises: Exercise[];
  onBack: () => void;
  onEdit: (ex: Exercise) => void;
  onAdd: () => void;
  onRefresh: () => void;
}> = ({ exercises, onBack, onEdit, onAdd, onRefresh }) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedExIds, setSelectedExIds] = useState<Set<string>>(new Set());
  const [bulkActionModal, setBulkActionModal] = useState<'group' | 'level' | null>(null);
  const [bulkValue, setBulkValue] = useState('');

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedExIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedExIds(newSet);
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedExIds.size} exercises? This cannot be undone.`)) return;
    const ids = Array.from(selectedExIds) as string[];
    await Promise.all(ids.map(id => UsersRepository.deleteExercise(id)));
    setIsSelectionMode(false);
    setSelectedExIds(new Set());
    onRefresh();
  };

  const handleBulkUpdate = async () => {
    if (!bulkValue) return;
    const ids = Array.from(selectedExIds) as string[];
    const payload: Partial<Exercise> = {};
    if (bulkActionModal === 'group') payload.groupId = bulkValue.toLowerCase();
    else if (bulkActionModal === 'level') payload.level = bulkValue as any;

    await Promise.all(ids.map(id => UsersRepository.updateExercise(id, payload)));
    setBulkActionModal(null);
    setIsSelectionMode(false);
    setSelectedExIds(new Set());
    setBulkValue('');
    onRefresh();
  };

  const getExercisesByGroup = () => {
    const groups: Record<string, Exercise[]> = {};
    exercises.forEach(ex => {
      if (searchTerm && !ex.name.toLowerCase().includes(searchTerm.toLowerCase())) return;
      const key = ex.groupId.toLowerCase();
      if (!groups[key]) groups[key] = [];
      groups[key].push(ex);
    });
    return groups;
  };

  const exercisesByGroup = getExercisesByGroup();
  const allUsedGroups = Object.keys(exercisesByGroup);
  const knownGroups = new Set(MUSCLE_HIERARCHY.flatMap(z => z.groups));
  const otherGroups = allUsedGroups.filter(g => !knownGroups.has(g));

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 transition-colors relative">
      {/* Header Sticky */}
      <div className="bg-white dark:bg-gray-800 p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between sticky top-0 z-50 transition-colors">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
            <ChevronLeft className="w-6 h-6 text-gray-600 dark:text-gray-300" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('library')}</h1>
        </div>
        <div className="flex gap-2">
          {exercises.length > 0 && (
            <button
              onClick={() => setIsSelectionMode(!isSelectionMode)}
              className={`px-3 py-1 text-xs font-bold rounded-full border transition-all ${isSelectionMode ? 'bg-gray-900 dark:bg-cyan-500 text-white dark:text-gray-900 border-gray-900 dark:border-cyan-500' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600'}`}
            >
              {isSelectionMode ? t('done') : t('select')}
            </button>
          )}
          <button
            onClick={onAdd}
            className="p-2 rounded-full bg-blue-600 dark:bg-cyan-600 text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 sticky top-[72px] z-40 transition-colors">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('search_exercises')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 p-3 bg-gray-100 dark:bg-gray-900 border-none rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
        {exercises.length === 0 && (
          <div className="p-10 text-center text-gray-400">{t('no_exercises_found')}</div>
        )}

        {MUSCLE_HIERARCHY.map((zone, idx) => {
          const activeGroupsInZone = zone.groups.filter(g => exercisesByGroup[g]);
          if (activeGroupsInZone.length === 0) return null;

          return (
            <div key={zone.key}>
              <h3 className="text-xl font-black text-gray-800 dark:text-gray-200 mb-3 border-b-2 border-gray-200 dark:border-gray-700 pb-1 sticky top-0 bg-gray-50 dark:bg-gray-900 z-30 py-2 transition-colors">
                {idx + 1}. {t(zone.key)}
              </h3>
              <div className="space-y-4 pl-2">
                {activeGroupsInZone.map(groupName => (
                  <div key={groupName}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-cyan-400"></div>
                      <h4 className="font-bold text-gray-600 dark:text-gray-400 capitalize">
                        {t('group_' + groupName.replace(' ', '_'))}
                        <span className="ml-2 bg-gray-100 dark:bg-gray-800 border dark:border-gray-700 text-gray-500 dark:text-gray-400 text-[10px] px-1.5 py-0.5 rounded-full">{exercisesByGroup[groupName].length}</span>
                      </h4>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden ml-4 transition-colors">
                      {exercisesByGroup[groupName].map((ex, i) => (
                        <div
                          key={ex.id}
                          className={`p-4 flex items-center gap-3 ${i !== exercisesByGroup[groupName].length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''} ${isSelectionMode ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700/50' : ''} transition-colors`}
                          onClick={() => isSelectionMode && toggleSelection(ex.id)}
                        >
                          {isSelectionMode && (
                            <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${selectedExIds.has(ex.id) ? 'bg-blue-600 dark:bg-cyan-500 border-blue-600 dark:border-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900'}`}>
                              {selectedExIds.has(ex.id) && <Check className="w-3.5 h-3.5 text-white dark:text-gray-900 stroke-[3]" />}
                            </div>
                          )}

                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-gray-900 dark:text-gray-100">{ex.name}</p>
                              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${ex.level === 'beginner'
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 dark:border-green-900/50'
                                : ex.level === 'advanced'
                                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 dark:border-red-900/50'
                                  : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 dark:border-yellow-900/50'
                                }`}>{ex.level}</span>
                              {ex.nscaCategory && (
                                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 text-yellow-500 shadow-sm flex items-center gap-1" title="Questo esercizio attiva i Badge NSCA dell'atleta">
                                  <Trophy className="w-3 h-3" /> NSCA
                                </span>
                              )}
                              {ex.measurement === 'time' && (
                                <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border border-orange-200 dark:border-orange-900/50 flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> {t('time')}
                                </span>
                              )}
                              {ex.videoUrl && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.dispatchEvent(new CustomEvent('play-video', { detail: ex.videoUrl }));
                                  }}
                                  className="ml-auto bg-gray-100 dark:bg-gray-700 p-1.5 rounded-full hover:bg-blue-50 dark:hover:bg-cyan-900/30 text-gray-400 hover:text-blue-500 dark:hover:text-cyan-400 transition-colors"
                                >
                                  <Video className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1 line-clamp-1">{ex.description}</p>
                          </div>

                          {!isSelectionMode && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onEdit(ex); }}
                              className="p-2 text-gray-300 dark:text-gray-500 hover:text-blue-600 dark:hover:text-cyan-400 hover:bg-blue-50 dark:hover:bg-gray-700 rounded-full transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Other Groups */}
        {otherGroups.length > 0 && (
          <div>
            <h3 className="text-xl font-black text-gray-800 dark:text-gray-200 mb-3 border-b-2 border-gray-200 dark:border-gray-700 pb-1 sticky top-0 bg-gray-50 dark:bg-gray-900 z-30 py-2">
              {t('zone_other')}
            </h3>
            <div className="space-y-4 pl-2">
              {otherGroups.map(groupName => (
                <div key={groupName}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-cyan-400"></div>
                    <h4 className="font-bold text-gray-600 dark:text-gray-400 capitalize">
                      {groupName}
                      <span className="ml-2 bg-gray-100 dark:bg-gray-800 border dark:border-gray-700 text-gray-500 dark:text-gray-400 text-[10px] px-1.5 py-0.5 rounded-full">{exercisesByGroup[groupName].length}</span>
                    </h4>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden ml-4">
                    {exercisesByGroup[groupName].map((ex, i) => (
                      <div
                        key={ex.id}
                        className={`p-4 flex items-center gap-3 ${i !== exercisesByGroup[groupName].length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''} ${isSelectionMode ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700/50' : ''}`}
                        onClick={() => isSelectionMode && toggleSelection(ex.id)}
                      >
                        {isSelectionMode && (
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${selectedExIds.has(ex.id) ? 'bg-blue-600 dark:bg-cyan-500 border-blue-600 dark:border-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900'}`}>
                            {selectedExIds.has(ex.id) && <Check className="w-3.5 h-3.5 text-white dark:text-gray-900 stroke-[3]" />}
                          </div>
                        )}

                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-900 dark:text-gray-100">{ex.name}</p>
                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border bg-gray-100 dark:bg-gray-700 dark:border-gray-600 text-gray-600 dark:text-gray-300">{ex.level}</span>
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1 line-clamp-1">{ex.description}</p>
                        </div>

                        {!isSelectionMode && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onEdit(ex); }}
                            className="p-2 text-gray-300 dark:text-gray-500 hover:text-blue-600 dark:hover:text-cyan-400 hover:bg-blue-50 dark:hover:bg-gray-700 rounded-full transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* FLOATING ACTION BAR FOR BULK ACTIONS */}
      {isSelectionMode && selectedExIds.size > 0 && (
        <div className="absolute bottom-6 left-4 right-4 bg-gray-900 dark:bg-gray-800/90 dark:backdrop-blur-md text-white rounded-2xl shadow-2xl p-4 flex items-center justify-between z-50 animate-slide-up border border-transparent dark:border-gray-700/50">
          <div className="flex items-center gap-3">
            <span className="bg-white dark:bg-cyan-500 text-gray-900 font-bold text-xs px-2 py-1 rounded-md">{selectedExIds.size}</span>
            <span className="text-sm font-semibold dark:text-gray-300">{t('selected')}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBulkActionModal('group')}
              className="p-2 hover:bg-gray-700 rounded-lg flex flex-col items-center gap-1 dark:text-gray-400 dark:hover:text-cyan-400 transition-colors"
            >
              <FolderOpen className="w-5 h-5" />
              <span className="text-[10px] uppercase">{t('group')}</span>
            </button>
            <button
              onClick={() => setBulkActionModal('level')}
              className="p-2 hover:bg-gray-700 rounded-lg flex flex-col items-center gap-1 dark:text-gray-400 dark:hover:text-yellow-400 transition-colors"
            >
              <Activity className="w-5 h-5" />
              <span className="text-[10px] uppercase">{t('level')}</span>
            </button>
            <div className="w-px h-8 bg-gray-700 mx-1"></div>
            <button
              onClick={handleBulkDelete}
              className="p-2 hover:bg-red-900/50 text-red-400 rounded-lg flex flex-col items-center gap-1"
            >
              <Trash2 className="w-5 h-5" />
              <span className="text-[10px] uppercase">{t('delete')}</span>
            </button>
          </div>
        </div>
      )}

      {/* BULK ACTION MODAL */}
      {bulkActionModal && (
        <div className="absolute inset-0 bg-black/50 dark:bg-black/80 z-[70] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 w-full rounded-2xl p-6 shadow-2xl border border-transparent dark:border-gray-700 transition-colors">
            <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">
              {t('bulk_change')} {bulkActionModal === 'group' ? t('muscle_group') : t('difficulty')}
            </h3>

            {bulkActionModal === 'group' ? (
              <select
                className="w-full p-3 border dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white capitalize mb-4"
                value={bulkValue}
                onChange={e => setBulkValue(e.target.value)}
              >
                <option value="">{t('select_new_group')}</option>
                {MUSCLE_HIERARCHY.map((zone, idx) => (
                  <optgroup key={zone.key} label={`${idx + 1}. ${t(zone.key)}`}>
                    {zone.groups.map(g => (
                      <option key={g} value={g}>• {t('group_' + g)}</option>
                    ))}
                  </optgroup>
                ))}
                {otherGroups.length > 0 && (
                  <optgroup label={t('other')}>
                    {otherGroups.map(g => <option key={g} value={g}>• {g}</option>)}
                  </optgroup>
                )}
              </select>
            ) : (
              <select
                className="w-full p-3 border dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white capitalize mb-4"
                value={bulkValue}
                onChange={e => setBulkValue(e.target.value)}
              >
                <option value="">{t('select_new_level')}</option>
                <option value="beginner">{t('beginner')}</option>
                <option value="intermediate">{t('intermediate')}</option>
                <option value="advanced">{t('advanced')}</option>
              </select>
            )}

            <Button fullWidth onClick={handleBulkUpdate} disabled={!bulkValue} className="dark:bg-cyan-500 dark:text-gray-900">{t('apply')}</Button>
            <button onClick={() => setBulkActionModal(null)} className="w-full text-center p-3 text-gray-500 dark:text-gray-400 font-bold mt-2 hover:text-gray-800 dark:hover:text-white">{t('cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- CLIENT DETAIL VIEW COMPONENT ---
const ClientDetailView: React.FC<{
  client: User;
  onBack: () => void;
  ptExercises: Exercise[];
  onEditPlan: (workout: Workout) => void;
}> = ({ client, onBack, ptExercises, onEditPlan }) => {
  const [localClient, setLocalClient] = useState<User>(client);
  const [logs, setLogs] = useState<Log[]>([]);
  const [allSessions, setAllSessions] = useState<WorkoutSession[]>([]);
  const [planSummary, setPlanSummary] = useState<ClientPlanSummary | null>(null);
  const [activePlan, setActivePlan] = useState<Workout | null>(null);
  const [allPlans, setAllPlans] = useState<Workout[]>([]); // Track all plans for history grouping
  const [exerciseMap, setExerciseMap] = useState<Record<string, string>>({});
  const [fullExerciseMap, setFullExerciseMap] = useState<Record<string, Exercise>>({});
  const [summaries, setSummaries] = useState<ClientExerciseSummary[]>([]);
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [showAddMeas, setShowAddMeas] = useState(false);
  const [newMeas, setNewMeas] = useState<Partial<BodyMeasurement>>({});
  const [viewingNote, setViewingNote] = useState<string | null>(null);

  // NEW: State for displaying session details modal
  const [viewingSession, setViewingSession] = useState<{ date: string, logs: Log[] } | null>(null);
  // NEW: State for expanded plan in history
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  const { t } = useTranslation();

  useEffect(() => {
    const fetchEverything = async () => {
      const [fetchedLogs, fetchedSessions, fetchedMeasurements, fetchedWorkouts] = await Promise.all([
        LogsRepository.getAllLogsForClient(localClient.uid, true),
        SessionsRepository.getAllSessionsForClient(localClient.uid),
        UsersRepository.getMeasurements(localClient.uid),
        WorkoutsRepository.getWorkoutsForClient(localClient.uid)
      ]);

      // Optimize: Use the logs we already fetched to generate summaries without a second database call
      const fetchedSummaries = await UsersRepository.getClientExerciseSummaries(localClient.uid, fetchedLogs);
      const fetchedSummary = await UsersRepository.getClientPlanSummary(localClient.uid);

      setLogs(fetchedLogs);
      setAllSessions(fetchedSessions);
      setPlanSummary(fetchedSummary);

      // Ordina i piani per data di inizio decrescente (più recenti prima)
      fetchedWorkouts.sort((a, b) => b.startDate.localeCompare(a.startDate));

      setAllPlans(fetchedWorkouts);

      // Determine active plan from list (ora trova sempre l'ultimo grazie al sort)
      const current = fetchedWorkouts.find(w => w.status === 'ACTIVE');
      setActivePlan(current || null);
      if (current) setExpandedPlanId(current.id);

      const map: Record<string, string> = {};
      const fullMap: Record<string, Exercise> = {};
      ptExercises.forEach(e => {
        map[e.id] = e.name;
        fullMap[e.id] = e;
      });
      setExerciseMap(map);
      setFullExerciseMap(fullMap);
      setSummaries(fetchedSummaries.sort((a, b) => b.pr - a.pr));
      setMeasurements(fetchedMeasurements);
    };

    fetchEverything();
  }, [client, ptExercises]);

  const handleAddMeasurement = async () => {
    const weightVal = Number(newMeas.weight) || 0;

    await UsersRepository.addMeasurement({
      userId: localClient.uid,
      date: toLocalISOString(new Date()),
      weight: weightVal,
      neck: Number(newMeas.neck) || 0,
      shoulders: Number(newMeas.shoulders) || 0,
      chest: Number(newMeas.chest) || 0,
      bicep: Number(newMeas.bicep) || 0,
      forearm: Number(newMeas.forearm) || 0,
      waist: Number(newMeas.waist) || 0,
      hips: Number(newMeas.hips) || 0,
      thigh: Number(newMeas.thigh) || 0,
      lowerThigh: Number(newMeas.lowerThigh) || 0,
      calf: Number(newMeas.calf) || 0,
    });

    // SYNC WITH CLIENT PROFILE
    if (weightVal > 0) {
      try {
        await AuthRepository.updateProfile(localClient, { weight: weightVal });
        setLocalClient(prev => ({ ...prev, weight: weightVal }));
      } catch (e) {
        console.error("Failed to sync profile weight", e);
      }
    }

    setShowAddMeas(false);
    setNewMeas({});
    UsersRepository.getMeasurements(localClient.uid).then(setMeasurements);
  };

  // Group by PLAN -> SESSION
  const groupedHistory = useMemo(() => {
    const planGroups: Record<string, {
      planId: string;
      planName: string;
      isUnknown: boolean;
      startDate: string;
      sessions: Record<string, {
        date: string;
        logs: Log[];
        totalVolume: number;
        totalSets: number;
        fromSessionSummary: boolean;
      }>
    }> = {};

    // 1. Prima aggiungi tutte le sessioni ufficiali
    allSessions.forEach(session => {
      const plan = allPlans.find(p => p.id === session.workoutId);
      const planId = plan?.id || 'unknown_plan';
      const planName = plan?.name || 'Unassigned / Old Workouts';

      if (!planGroups[planId]) {
        planGroups[planId] = {
          planId, planName, isUnknown: !plan, startDate: plan?.startDate || '1970-01-01', sessions: {}
        };
      }

      const dateKey = getLocalDatePart(session.date);
      planGroups[planId].sessions[dateKey] = {
        date: session.date,
        logs: [],
        totalVolume: session.volume,
        totalSets: session.sets,
        fromSessionSummary: true
      };
    });

    // 2. Poi itera sui log per popolare l'array logs e creare sessioni legacy
    logs.forEach(log => {
      const plan = allPlans.find(p => p.id === log.workoutId);
      const planId = plan?.id || 'unknown_plan';
      const planName = plan?.name || 'Unassigned / Old Workouts';
      const dateKey = getLocalDatePart(log.date);

      if (!planGroups[planId]) {
        planGroups[planId] = {
          planId, planName, isUnknown: !plan, startDate: plan?.startDate || '1970-01-01', sessions: {}
        };
      }

      if (!planGroups[planId].sessions[dateKey]) {
        planGroups[planId].sessions[dateKey] = {
          date: log.date,
          logs: [],
          totalVolume: 0,
          totalSets: 0,
          fromSessionSummary: false
        };
      }

      const sessionEntry = planGroups[planId].sessions[dateKey];
      sessionEntry.logs.push(log);

      if (!sessionEntry.fromSessionSummary) {
        // FIX: Ignora serie temp e serie saltate (completed=false)
        if (log.id?.startsWith('temp_') || log.completed === false) return;
        const ex = fullExerciseMap[log.exerciseId] || { isBodyweight: false, isUnilateral: false };
        const domainLog = new DomainLog(log);
        const logBw = resolveBodyweight(log.bodyweightAtLog, localClient.weight);
        sessionEntry.totalVolume += domainLog.calculateVolume(ex, logBw);
        sessionEntry.totalSets += 1;
      }
    });

    // FIX Bug 2: Ricalcola totalSets e totalVolume per le sessioni ufficiali
    // dai log reali associati, ignorando i valori salvati in Firestore potenzialmente corrotti.
    Object.values(planGroups).forEach(group => {
      Object.values(group.sessions).forEach(session => {
        if (session.fromSessionSummary && session.logs.length > 0) {
          const validLogs = session.logs.filter(l => l.completed !== false && !l.id?.startsWith('temp_'));
          session.totalSets = validLogs.length;
          session.totalVolume = validLogs.reduce((acc, l) => {
            const ex = fullExerciseMap[l.exerciseId] || { isBodyweight: false, isUnilateral: false };
            const domainLog = new DomainLog(l);
            const logBw = resolveBodyweight(l.bodyweightAtLog, localClient.weight);
            return acc + domainLog.calculateVolume(ex, logBw);
          }, 0);
        }
      });
    });

    // Convert map to sorted array (Newest plans first)
    return Object.values(planGroups).sort((a, b) => {
      // Unknown plan always at the bottom
      if (a.isUnknown && !b.isUnknown) return 1;
      if (!a.isUnknown && b.isUnknown) return -1;
      // Sort by plan start date descending
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
    }).map(group => ({
      ...group,
      // Sort sessions inside the plan by date descending
      sessions: Object.values(group.sessions).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    }));
  }, [logs, allPlans, fullExerciseMap, localClient.weight]);

  // When viewing a session, group its logs by exercise for clean display
  const sessionDetailLogs = useMemo(() => {
    if (!viewingSession) return [];

    const groups: Record<string, {
      id: string,
      exerciseId: string,
      sets: Log[]
    }> = {};

    viewingSession.logs.forEach(log => {
      // FIX: Non mostrare le serie saltate nel dettaglio sessione PT
      if (log.completed === false) return;
      if (!groups[log.exerciseId]) {
        groups[log.exerciseId] = {
          id: log.exerciseId,
          exerciseId: log.exerciseId,
          sets: []
        };
      }
      groups[log.exerciseId].sets.push(log);
    });

    return Object.values(groups);
  }, [viewingSession]);

  const lastActive = logs.length > 0 ? formatToLocaleDate(logs[0].date) : 'Never';

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      {/* Note Viewer Modal */}
      {viewingNote && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={() => setViewingNote(null)}>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-500 dark:text-cyan-400" /> {t('note_label')}
              </h3>
              <button onClick={() => setViewingNote(null)} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{viewingNote}</p>
            <Button fullWidth className="mt-6 dark:bg-cyan-500 dark:text-gray-900" onClick={() => setViewingNote(null)}>{t('close')}</Button>
          </div>
        </div>
      )}

      {/* Session Detail Modal */}
      {viewingSession && (
        <div className="absolute inset-0 z-50 flex flex-col bg-gray-50 dark:bg-gray-900 animate-slide-up">
          <div className="bg-white dark:bg-gray-800 p-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 shrink-0 transition-colors sticky top-0 z-50">
            <button onClick={() => setViewingSession(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors relative z-20">
              <ChevronLeft className="w-6 h-6 text-gray-600 dark:text-gray-300" />
            </button>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {t('session_details')}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatLongDate(viewingSession.date)}
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {sessionDetailLogs.map(group => (
              <div key={group.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <span className="font-bold text-gray-900 dark:text-white text-sm">{exerciseMap[group.exerciseId] || 'Unknown Exercise'}</span>
                  <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 px-2 py-1 rounded-full font-bold">
                    {group.sets.length} {t('sets')}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {group.sets.sort((a, b) => a.seriesNo - b.seriesNo).map((set, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center bg-blue-50 dark:bg-gray-700/50 border border-blue-100 dark:border-gray-600 px-3 py-1.5 rounded-lg transition-colors ${set.note ? 'cursor-pointer hover:bg-blue-100 dark:hover:bg-gray-600 ring-1 ring-blue-200 dark:ring-gray-500' : ''}`}
                      onClick={() => set.note && setViewingNote(set.note)}
                    >
                      <div className="flex flex-col items-center leading-none mr-2 border-r border-blue-200 dark:border-gray-600 pr-2">
                        <span className="text-[10px] text-gray-400 uppercase font-bold">{t('set_label')}</span>
                        <span className="text-sm font-bold text-blue-400 dark:text-cyan-500">{set.seriesNo}</span>
                      </div>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{set.weight}kg</span>
                      <span className="text-[10px] text-gray-400 mx-1">x</span>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{set.reps}</span>
                      {set.note && <MessageSquare className="w-3 h-3 ml-2 text-blue-400 dark:text-gray-400" />}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 p-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 shrink-0 transition-colors sticky top-0 z-50">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-6 h-6 text-gray-600 dark:text-gray-300" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{localClient.name}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">{localClient.email}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Adherence Card with EDIT button */}
        <div className="bg-gray-900 dark:bg-gray-800 text-white p-5 rounded-2xl shadow-lg relative overflow-hidden transition-colors border border-transparent dark:border-gray-700">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-full -mr-10 -mt-10"></div>

          {/* Edit Button for Active Plan */}
          {activePlan && (
            <button
              onClick={() => onEditPlan(activePlan)}
              className="absolute top-4 right-4 z-20 p-2 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-sm transition-colors text-white"
              title={t('edit_active_plan')}
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}

          <div className="relative z-10 flex justify-between items-end">
            <div>
              <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">{t('plan_adherence')}</p>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black notranslate" translate="no">{planSummary ? `${planSummary.adherencePercent}%` : '--%'}</span>
                <span className="text-sm text-gray-400 font-medium">{t('consistency_label')}</span>
              </div>
              {activePlan && (
                <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {t('ends_colon')} {formatToLocaleDate(activePlan.endDate)}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold notranslate" translate="no">{planSummary ? planSummary.totalSessionsCompleted : '--'}</p>
              <p className="text-[10px] text-gray-400 uppercase">{t('sessions_done_label')}</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-700 h-1.5 rounded-full mt-4 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${(planSummary?.adherencePercent || 0) >= 80 ? 'bg-green-500' :
                (planSummary?.adherencePercent || 0) >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
              style={{ width: `${planSummary?.adherencePercent || 0}%` }}
            ></div>
          </div>
        </div>

        {/* Analytics Charts */}
        <ClientAnalytics logs={logs} sessions={allSessions} exercises={exerciseMap} fullExercises={fullExerciseMap} clientWeight={localClient.weight} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 notranslate" translate="no">
          <AdherenceBarChart logs={logs} />
          <CompletionDonutChart logs={logs} />
        </div>
        <div className="space-y-4 notranslate" translate="no">
          <MuscleGroupRadarChart logs={logs} exercises={fullExerciseMap} />
          <ACWRChart logs={logs} sessions={allSessions} exercises={fullExerciseMap} user={localClient} />
        </div>
        <div className="notranslate" translate="no">
          <RPEVolumeComposedChart logs={logs} exercises={exerciseMap} fullExercises={fullExerciseMap} clientWeight={localClient.weight} />
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col justify-between transition-colors">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold flex items-center gap-1"><Activity className="w-3 h-3" /> {t('avg_volume') || 'Avg Volume'}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white mt-2 notranslate" translate="no">
              {planSummary ? (planSummary.avgWeeklyVolume / 1000).toFixed(1) : '--'}k <span className="text-sm text-gray-400 font-normal">{t('kg')}/wk</span>
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col justify-between transition-colors">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold flex items-center gap-1"><Calendar className="w-3 h-3" /> {t('last_active')}</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white mt-2">{lastActive}</p>
          </div>
        </div>

        {/* Measurements Section */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-gray-700 dark:text-white flex items-center gap-2"><Ruler className="w-4 h-4" /> {t('measurements')}</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => UsersRepository.getMeasurements(localClient.uid).then(setMeasurements)}
                className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-bold w-7 h-7 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center"
                title="Refresh measurements"
              >↻</button>
              <button onClick={() => setShowAddMeas(true)} className="text-xs bg-blue-50 dark:bg-cyan-900/30 text-blue-600 dark:text-cyan-400 font-bold px-3 py-1.5 rounded-full hover:bg-blue-100 dark:hover:bg-cyan-900/50 transition-colors">+ Log</button>
            </div>
          </div>

          <div className="mb-4">
            <MeasurementsTrendChart measurements={measurements} />
          </div>

          <div className="space-y-3">
            {measurements.length === 0 ? (
              <div className="text-center py-4 border border-dashed border-gray-200 dark:border-gray-600 rounded-xl text-xs text-gray-400">{t('no_measurements')}</div>
            ) : (
              measurements.slice(0, 3).map(m => (
                <div key={m.id} className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm transition-colors">
                  <div className="flex justify-between mb-2">
                    <span className="text-xs font-bold text-gray-400">{formatToLocaleDate(m.date)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-center notranslate" translate="no">
                    <div className="flex justify-between items-center"><span className="text-[10px] text-gray-400 uppercase">{t('meas_weight')}</span><span className="text-xs font-bold text-gray-900 dark:text-white">{m.weight} {t('kg')}</span></div>
                    {m.neck ? <div className="flex justify-between items-center"><span className="text-[10px] text-gray-400 uppercase">{t('meas_neck')}</span><span className="text-xs font-bold text-gray-900 dark:text-white">{m.neck} cm</span></div> : null}
                    {m.shoulders ? <div className="flex justify-between items-center"><span className="text-[10px] text-gray-400 uppercase">{t('meas_shoulders')}</span><span className="text-xs font-bold text-gray-900 dark:text-white">{m.shoulders} cm</span></div> : null}
                    {m.chest ? <div className="flex justify-between items-center"><span className="text-[10px] text-gray-400 uppercase">{t('meas_chest')}</span><span className="text-xs font-bold text-gray-900 dark:text-white">{m.chest} cm</span></div> : null}
                    {m.bicep ? <div className="flex justify-between items-center"><span className="text-[10px] text-gray-400 uppercase">{t('meas_arm')}</span><span className="text-xs font-bold text-gray-900 dark:text-white">{m.bicep} cm</span></div> : null}
                    {m.forearm ? <div className="flex justify-between items-center"><span className="text-[10px] text-gray-400 uppercase">{t('meas_forearm')}</span><span className="text-xs font-bold text-gray-900 dark:text-white">{m.forearm} cm</span></div> : null}
                    {m.waist ? <div className="flex justify-between items-center"><span className="text-[10px] text-gray-400 uppercase">{t('meas_waist')}</span><span className="text-xs font-bold text-gray-900 dark:text-white">{m.waist} cm</span></div> : null}
                    {m.hips ? <div className="flex justify-between items-center"><span className="text-[10px] text-gray-400 uppercase">{t('meas_hips')}</span><span className="text-xs font-bold text-gray-900 dark:text-white">{m.hips} cm</span></div> : null}
                    {m.thigh ? <div className="flex justify-between items-center"><span className="text-[10px] text-gray-400 uppercase">{t('meas_thigh')}</span><span className="text-xs font-bold text-gray-900 dark:text-white">{m.thigh} cm</span></div> : null}
                    {m.lowerThigh ? <div className="flex justify-between items-center"><span className="text-[10px] text-gray-400 uppercase">{t('meas_lower_thigh')}</span><span className="text-xs font-bold text-gray-900 dark:text-white">{m.lowerThigh} cm</span></div> : null}
                    {m.calf ? <div className="flex justify-between items-center"><span className="text-[10px] text-gray-400 uppercase">{t('meas_calf')}</span><span className="text-xs font-bold text-gray-900 dark:text-white">{m.calf} cm</span></div> : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Personal Records Section */}
        {summaries.length > 0 && (
          <div>
            <h3 className="font-bold text-gray-700 dark:text-white mb-3 flex items-center gap-2"><Trophy className="w-4 h-4" /> {t('personal_records')}</h3>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {summaries.map(s => (
                <div key={s.exerciseId} className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm min-w-[140px] shrink-0 transition-colors">
                  <p className="text-xs text-gray-400 font-bold uppercase truncate">{exerciseMap[s.exerciseId] || 'Exercise'}</p>
                  <p className="text-xl font-black text-gray-900 dark:text-white mt-1 notranslate" translate="no">{s.pr} <span className="text-sm font-medium text-gray-400">{t('kg')}</span></p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Logs List (Grouped by Plan -> Session) */}
        <div>
          <h3 className="font-bold text-gray-700 dark:text-white mb-3 flex items-center gap-2"><ClipboardList className="w-4 h-4" /> {t('recent_activity')}</h3>
          {groupedHistory.length === 0 ? (
            <div className="text-center py-8 text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 transition-colors">
              {t('no_activity')}
            </div>
          ) : (
            <div className="space-y-4">
              {groupedHistory.map(group => {
                const isActive = group.planId === expandedPlanId;
                const isCurrentActivePlan = activePlan?.id === group.planId;

                return (
                  <div key={group.planId} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden transition-all">
                    {/* Plan Header */}
                    <button
                      onClick={() => setExpandedPlanId(isActive ? null : group.planId)}
                      className={`w-full p-4 flex items-center justify-between text-left transition-colors ${isActive ? 'bg-gray-50 dark:bg-gray-700/50' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 dark:text-white text-base">{group.planName}</span>
                          {isCurrentActivePlan && (
                            <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border border-green-200 dark:border-green-800">Active</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {group.sessions.length} {t('sessions_recorded')}
                        </p>
                      </div>
                      <div className={`p-1 rounded-full transition-transform duration-200 ${isActive ? 'rotate-180 bg-gray-200 dark:bg-gray-600' : ''}`}>
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      </div>
                    </button>

                    {/* Plan Sessions List */}
                    {isActive && (
                      <div className="border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 animate-slide-up">
                        {group.sessions.map(session => (
                          <button
                            key={session.date}
                            onClick={() => setViewingSession(session)}
                            className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group text-left pl-6"
                          >
                            <div>
                              <p className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 text-sm">
                                <Calendar className="w-3.5 h-3.5 text-blue-500 dark:text-cyan-400" />
                                 {formatShortWeekdayMonthDay(session.date)}
                              </p>
                              <p className="text-xs text-gray-400 mt-1 pl-5.5 notranslate" translate="no">
                                {session.totalSets} sets • {(session.totalVolume / 1000).toFixed(1)}k vol
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 dark:group-hover:text-cyan-400" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add Measurement Modal (Adaptive) */}
        {showAddMeas && (
          <div className="absolute inset-0 bg-black/50 dark:bg-black/80 dark:backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 w-full max-h-[90%] overflow-y-auto rounded-2xl p-6 shadow-2xl border border-transparent dark:border-gray-700 transition-colors animate-slide-up">
              <div className="flex justify-between mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
                <h3 className="font-bold text-lg text-gray-900 dark:text-white">{t('new_measurements')}</h3>
                <button onClick={() => setShowAddMeas(false)}><X className="w-6 h-6 text-gray-400 dark:hover:text-white" /></button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-blue-600 dark:text-cyan-400 uppercase block mb-1">{t('meas_weight')}</label>
                  <input type="number" placeholder="kg" className="w-full border border-blue-100 dark:border-gray-600 bg-blue-50 dark:bg-gray-900 text-gray-900 dark:text-white p-3 rounded-xl font-bold text-lg focus:outline-blue-500 dark:focus:border-cyan-500" onChange={e => setNewMeas({ ...newMeas, weight: parseFloat(e.target.value) })} />
                </div>

                <p className="text-xs font-bold text-gray-400 uppercase mt-2">{t('upper_body')}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{t('meas_neck')} (cm)</label><input type="number" className="w-full border dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-2 rounded-lg" onChange={e => setNewMeas({ ...newMeas, neck: parseFloat(e.target.value) })} /></div>
                  <div><label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{t('meas_shoulders')} (cm)</label><input type="number" className="w-full border dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-2 rounded-lg" onChange={e => setNewMeas({ ...newMeas, shoulders: parseFloat(e.target.value) })} /></div>
                  <div><label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{t('meas_chest')} (cm)</label><input type="number" className="w-full border dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-2 rounded-lg" onChange={e => setNewMeas({ ...newMeas, chest: parseFloat(e.target.value) })} /></div>
                  <div><label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{t('meas_arm')} (cm)</label><input type="number" className="w-full border dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-2 rounded-lg" onChange={e => setNewMeas({ ...newMeas, bicep: parseFloat(e.target.value) })} /></div>
                  <div><label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{t('meas_forearm')} (cm)</label><input type="number" className="w-full border dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-2 rounded-lg" onChange={e => setNewMeas({ ...newMeas, forearm: parseFloat(e.target.value) })} /></div>
                </div>

                <p className="text-xs font-bold text-gray-400 uppercase mt-2">{t('core_legs')}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{t('meas_waist')} (cm)</label><input type="number" className="w-full border dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-2 rounded-lg" onChange={e => setNewMeas({ ...newMeas, waist: parseFloat(e.target.value) })} /></div>
                  <div><label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{t('meas_hips')} (cm)</label><input type="number" className="w-full border dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-2 rounded-lg" onChange={e => setNewMeas({ ...newMeas, hips: parseFloat(e.target.value) })} /></div>
                  <div><label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{t('meas_thigh')} (cm)</label><input type="number" className="w-full border dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-2 rounded-lg" onChange={e => setNewMeas({ ...newMeas, thigh: parseFloat(e.target.value) })} /></div>
                  <div><label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{t('meas_lower_thigh')} (cm)</label><input type="number" className="w-full border dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-2 rounded-lg" onChange={e => setNewMeas({ ...newMeas, lowerThigh: parseFloat(e.target.value) })} /></div>
                  <div><label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{t('meas_calf')} (cm)</label><input type="number" className="w-full border dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-2 rounded-lg" onChange={e => setNewMeas({ ...newMeas, calf: parseFloat(e.target.value) })} /></div>
                </div>

                <Button fullWidth onClick={handleAddMeasurement} className="mt-4 dark:bg-cyan-500 dark:text-gray-900 dark:font-bold">{t('save_entry')}</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const PTDashboard: React.FC<Props> = ({ user }) => {
  const [view, setView] = useState<'home' | 'client' | 'library'>('home');
  const [clients, setClients] = useState<User[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const { t } = useTranslation();

  // Navigation State
  const [selectedClient, setSelectedClient] = useState<User | null>(null);

  // Modal States
  const [showExModal, setShowExModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);

  // Form States (Exercise)
  const [newExName, setNewExName] = useState('');
  const [newExGroup, setNewExGroup] = useState('');
  const [newExDesc, setNewExDesc] = useState('');
  const [newExVideo, setNewExVideo] = useState('');
  const [newExLevel, setNewExLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [newExMeasurement, setNewExMeasurement] = useState<'reps' | 'time'>('reps');
  const [isCustomGroup, setIsCustomGroup] = useState(false);
  const [newExNSCA, setNewExNSCA] = useState<string>('');
  const [newExEquipment, setNewExEquipment] = useState<Equipment>(Equipment.OTHER);
  const [newExUnilateral, setNewExUnilateral] = useState<boolean>(false);


  // Form States (Plan)
  const [newPlanName, setNewPlanName] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [planEndDate, setPlanEndDate] = useState('');
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [numDays, setNumDays] = useState(1);
  const [activeDayTab, setActiveDayTab] = useState(0);
  const [draftItems, setDraftItems] = useState<Record<number, DraftItem[]>>({});
  const [showExPicker, setShowExPicker] = useState(false);
  const [copied, setCopied] = useState(false);

  const refreshData = () => {
    UsersRepository.getClientsForPT(user.uid).then(setClients);
    UsersRepository.getExercises(user.uid).then(setExercises);
  };

    useEffect(() => {
    refreshData();
    // AUTOMATIC TEST INJECTION
    const injectData = async () => {
      const allEx = await UsersRepository.getExercises(user.uid);
      if (!allEx.find(e => e.name === "TEST Pistol Squat")) {
        await UsersRepository.createExercise(user.uid, {
          name: "TEST Pistol Squat",
          groupId: "gambe",
          description: "Test generato automaticamente",
          equipment: Equipment.BODYWEIGHT,
          level: "advanced",
          measurement: "reps",
          videoUrl: "",
          nscaCategory: null,
          isUnilateral: true
        });
        refreshData();
      }
    };
    injectData();
  }, [user]);

  const handleCopyCode = () => {
    if (user.inviteCode) {
      navigator.clipboard.writeText(user.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSaveExercise = async () => {
    if (!newExName.trim() || !newExGroup.trim()) {
      alert("Please ensure both the Exercise Name and Muscle Group are filled out.");
      return;
    }

    const payload = {
      name: newExName,
      groupId: newExGroup.trim().toLowerCase(),
      description: newExDesc || 'Custom exercise',
      equipment: newExEquipment,
      level: newExLevel,
      measurement: newExMeasurement,
      videoUrl: newExVideo.trim(),
      nscaCategory: newExNSCA || null,
      isUnilateral: newExUnilateral
    };

    if (editingExercise) {
      await UsersRepository.updateExercise(editingExercise.id, payload);
    } else {
      await UsersRepository.createExercise(user.uid, payload);
    }

    setNewExName('');
    setNewExGroup('');
    setNewExDesc('');
    setNewExVideo('');
    setNewExLevel('beginner');
    setNewExMeasurement('reps');
    setIsCustomGroup(false);
    setNewExNSCA('');
    setNewExEquipment(Equipment.OTHER);
    setNewExUnilateral(false);
    setShowExModal(false);
    setEditingExercise(null);
    refreshData();
  };

  const handleDeleteExercise = async () => {
    if (!editingExercise) return;
    if (confirm(`${t('delete_exercise_confirm')} "${editingExercise.name}"?`)) {
      await UsersRepository.deleteExercise(editingExercise.id);
      setShowExModal(false);
      setEditingExercise(null);
      refreshData();
    }
  };

  const openEditModal = (ex: Exercise) => {
    setEditingExercise(ex);
    setNewExName(ex.name);
    setNewExGroup(ex.groupId);
    setNewExDesc(ex.description);
    setNewExVideo(ex.videoUrl || '');
    setNewExLevel(ex.level);
    setNewExMeasurement(ex.measurement || 'reps');
    setNewExNSCA(ex.nscaCategory || '');
    setNewExEquipment(ex.equipment || Equipment.OTHER);
    setNewExUnilateral(ex.isUnilateral || false);
    const knownGroups = new Set(MUSCLE_HIERARCHY.flatMap(z => z.groups));
    setIsCustomGroup(!knownGroups.has(ex.groupId));
    setShowExModal(true);
  };

  // Plan Handlers
  const addItemToDay = (exId: string) => {
    const currentDayItems = draftItems[activeDayTab] || [];
    const ex = exercises.find(e => e.id === exId);
    const defaultVal = ex?.measurement === 'time' ? 30 : 10;

    const newItem: DraftItem = { exerciseId: exId, sets: 3, reps: defaultVal, restSeconds: 60, dayIndex: activeDayTab, supersetGroup: undefined };
    setDraftItems({
      ...draftItems,
      [activeDayTab]: [...currentDayItems, newItem]
    });
  };

  const toggleSuperset = (dayIdx: number, itemIdx: number) => {
    const dayList = [...(draftItems[dayIdx] || [])];
    dayList[itemIdx] = { ...dayList[itemIdx], supersetGroup: cycleGroup(dayList[itemIdx].supersetGroup) };
    setDraftItems({ ...draftItems, [dayIdx]: dayList });
  };

  const updateDraftItem = (dayIdx: number, itemIdx: number, field: keyof DraftItem, value: number) => {
    const dayList = [...(draftItems[dayIdx] || [])];
    dayList[itemIdx] = { ...dayList[itemIdx], [field]: value };
    setDraftItems({ ...draftItems, [dayIdx]: dayList });
  };

  const removeDraftItem = (dayIdx: number, itemIdx: number) => {
    const dayList = [...(draftItems[dayIdx] || [])];
    dayList.splice(itemIdx, 1);
    setDraftItems({ ...draftItems, [dayIdx]: dayList });
  };

  const moveDraftItem = (dayIdx: number, itemIdx: number, direction: -1 | 1) => {
    const dayList = [...(draftItems[dayIdx] || [])];
    if (itemIdx + direction < 0 || itemIdx + direction >= dayList.length) return;
    const temp = dayList[itemIdx];
    dayList[itemIdx] = dayList[itemIdx + direction];
    dayList[itemIdx + direction] = temp;
    setDraftItems({ ...draftItems, [dayIdx]: dayList });
  };

  const handleSavePlan = async () => {
    if (!newPlanName || !selectedClientId) {
      alert(t('error_plan_name_client'));
      return;
    }
    const finalItems: { exerciseId: string, dayIndex: number, sets: number, reps: number, restSeconds: number, supersetGroup?: string }[] = [];
    let hasItems = false;
    for (let d = 0; d < numDays; d++) {
      const items = draftItems[d] || [];
      if (items.length > 0) hasItems = true;
      items.forEach(item => {
        finalItems.push({
          exerciseId: item.exerciseId,
          dayIndex: d,
          sets: item.sets,
          reps: item.reps,
          restSeconds: item.restSeconds,
          supersetGroup: item.supersetGroup
        });
      });
    }

    if (!hasItems) {
      alert(t('error_plan_min_exercises'));
      return;
    }

    const supersetWarnings = validateSupersetGroups(finalItems);
    if (supersetWarnings.length > 0) {
      alert(`${t('error_superset_incomplete')}: ${supersetWarnings.join(', ')}`);
      return;
    }

    const finalEndDate = planEndDate || toLocalISOString(new Date(Date.now() + 86400000 * 30));

    if (editingWorkoutId) {
      await WorkoutsRepository.updateWorkoutPlan(editingWorkoutId, newPlanName, finalItems, finalEndDate);
      alert(t('plan_updated_success'));
    } else {
      await WorkoutsRepository.createWorkout(user.uid, selectedClientId, newPlanName, finalItems, finalEndDate);
      alert(t('plan_created_success'));
    }

    setNewPlanName('');
    setSelectedClientId('');
    setPlanEndDate('');
    setDraftItems({});
    setNumDays(1);
    setActiveDayTab(0);
    setEditingWorkoutId(null);
    setShowPlanModal(false);
  };

  const closePlanModal = () => {
    setShowPlanModal(false);
    setNewPlanName('');
    setSelectedClientId('');
    setPlanEndDate('');
    setDraftItems({});
    setEditingWorkoutId(null);
  };

  const handleEditActivePlan = async (workout: Workout) => {
    setEditingWorkoutId(workout.id);
    setNewPlanName(workout.name);
    setSelectedClientId(workout.clientId);
    setPlanEndDate(getLocalDatePart(workout.endDate));

    const items = await WorkoutsRepository.getPlanItems(workout.id);
    const itemsByDay: Record<number, DraftItem[]> = {};
    let maxDay = 0;

    items.forEach(item => {
      if (!itemsByDay[item.dayIndex]) itemsByDay[item.dayIndex] = [];
      itemsByDay[item.dayIndex].push({
        exerciseId: item.exerciseId,
        sets: item.sets,
        reps: item.reps,
        restSeconds: item.restSeconds,
        dayIndex: item.dayIndex,
        supersetGroup: item.supersetGroup || undefined
      });
      if (item.dayIndex > maxDay) maxDay = item.dayIndex;
    });

    setDraftItems(itemsByDay);
    setNumDays(maxDay + 1);
    setActiveDayTab(0);
    setShowPlanModal(true);
  };

  const getExercisesByGroup = () => {
    const groups: Record<string, Exercise[]> = {};
    exercises.forEach(ex => {
      const key = ex.groupId.toLowerCase();
      if (!groups[key]) groups[key] = [];
      groups[key].push(ex);
    });
    return groups;
  };

  const exercisesByGroup = getExercisesByGroup();

  const renderCurrentView = () => {
    if (view === 'client' && selectedClient) {
      return <ClientDetailView
        client={selectedClient}
        onBack={() => setView('home')}
        ptExercises={exercises}
        onEditPlan={handleEditActivePlan}
      />;
    }

    if (view === 'library') {
      return <ExerciseLibraryView
        exercises={exercises}
        onBack={() => setView('home')}
        onEdit={openEditModal}
        onAdd={() => {
          setEditingExercise(null);
          setNewExName('');
          setNewExGroup('');
          setNewExDesc('');
          setNewExVideo('');
          setNewExMeasurement('reps');
          setIsCustomGroup(false);
          setShowExModal(true);
        }}
        onRefresh={refreshData}
      />;
    }

    // Default: Home View
    return (
      <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 relative transition-colors duration-300">
        <div className="bg-white dark:bg-gray-800 p-6 border-b border-gray-100 dark:border-gray-700 pb-4 shrink-0 transition-colors duration-300">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('dashboard')}</h1>
            <ThemeToggle />
          </div>
          <div className="mt-4 flex items-center justify-between bg-blue-50 dark:bg-gray-700/50 p-4 rounded-xl border border-blue-100 dark:border-gray-600 transition-colors">
            <div>
              <p className="text-xs font-semibold text-blue-600 dark:text-gray-400 uppercase tracking-wide">{t('invite_code')}</p>
              <p className="text-2xl font-mono font-bold text-gray-900 dark:text-white mt-1 tracking-wider">{user.inviteCode}</p>
            </div>
            <button
              onClick={handleCopyCode}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm border transition-all ${copied
                ? 'bg-green-500 text-white border-green-500'
                : 'bg-white dark:bg-gray-800 text-blue-600 dark:text-cyan-400 border-blue-100 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-gray-700'
                }`}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
          {/* QUICK ACTIONS */}
          <div className="grid grid-cols-1 gap-4">
            <button
              onClick={() => setView('library')}
              className="p-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors active:scale-95"
            >
              <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-full text-purple-600 dark:text-purple-400">
                <Dumbbell className="w-6 h-6" />
              </div>
              <span className="font-bold text-sm text-gray-900 dark:text-white">{t('library')}</span>
            </button>
          </div>

          {/* Clients Section */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-gray-500 dark:text-cyan-400" /> {t('clients')} ({clients.length})
              </h2>
              <button
                onClick={() => {
                  setEditingWorkoutId(null);
                  setNewPlanName('');
                  setSelectedClientId('');
                  setPlanEndDate('');
                  setDraftItems({});
                  setNumDays(1);
                  setShowPlanModal(true);
                }}
                className="text-sm text-blue-600 dark:text-gray-900 font-bold bg-blue-50 dark:bg-cyan-400 px-3 py-1 rounded-lg hover:bg-blue-100 dark:hover:bg-cyan-300 disabled:opacity-50 transition-colors"
                disabled={clients.length === 0}
              >
                + {t('create_plan')}
              </button>
            </div>

            {clients.length === 0 ? (
              <div className="text-center py-8 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 transition-colors">
                <p className="text-gray-500 dark:text-gray-400 mb-2">{t('no_clients_linked')}</p>
                <p className="text-sm text-gray-400 dark:text-gray-500">{t('share_invite_start')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {clients.map(client => (
                  <div
                    key={client.uid}
                    onClick={() => { setSelectedClient(client); setView('client'); }}
                    className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 hover:shadow-md transition-all active:scale-[0.99] group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-cyan-900/30 flex items-center justify-center text-blue-600 dark:text-cyan-400 font-black text-sm shrink-0">
                        {client.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white">{client.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[160px]">{client.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                      <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-500 group-hover:text-blue-500 dark:group-hover:text-cyan-400 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  };

  return (
    <>
      {renderCurrentView()}

      {/* CREATE/EDIT EXERCISE MODAL (Global) */}
      {showExModal && (
        <div className="absolute inset-0 bg-black/50 dark:bg-black/80 dark:backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 w-full max-h-[90%] overflow-y-auto rounded-2xl p-6 shadow-2xl border border-transparent dark:border-gray-700 transition-colors">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                <Dumbbell className="w-5 h-5 dark:text-cyan-400" /> {editingExercise ? 'Edit Exercise' : t('new_exercise')}
              </h3>
              <button onClick={() => setShowExModal(false)}><X className="w-6 h-6 text-gray-400 dark:hover:text-white" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">{t('ex_name')}</label>
                <input
                  className="w-full p-3 border dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-blue-500 dark:focus:border-cyan-500"
                  placeholder="e.g. Deadlift"
                  value={newExName}
                  onChange={e => setNewExName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">{t('muscle_group')}</label>
                <div className="flex gap-2">
                  {isCustomGroup ? (
                    <div className="flex-1 flex gap-2">
                      <input
                        className="flex-1 p-3 border dark:border-gray-700 rounded-xl bg-blue-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:bg-white border-blue-200 dark:focus:border-cyan-500"
                        placeholder="Type new group name..."
                        value={newExGroup}
                        onChange={e => setNewExGroup(e.target.value)}
                        autoFocus
                      />
                      <button
                        onClick={() => setIsCustomGroup(false)}
                        className="px-3 py-2 text-sm text-gray-500 font-bold hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 flex gap-2">
                      <select
                        className="flex-1 p-3 border dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white capitalize focus:outline-blue-500 dark:focus:border-cyan-500"
                        value={newExGroup}
                        onChange={e => setNewExGroup(e.target.value)}
                      >
                        <option value="">{t('muscle_group')}</option>
                        {MUSCLE_HIERARCHY.map((zone, idx) => (
                          <optgroup key={zone.key} label={`${idx + 1}. ${t(zone.key)}`}>
                            {zone.groups.map(g => (
                              <option key={g} value={g}>• {t('group_' + g)}</option>
                            ))}
                          </optgroup>
                        ))}
                        {/* Just show existing dynamic groups if they exist */}
                        {Object.keys(exercisesByGroup).filter(g => !new Set(MUSCLE_HIERARCHY.flatMap(z => z.groups)).has(g)).length > 0 && (
                          <optgroup label={t('zone_other')}>
                            {Object.keys(exercisesByGroup).filter(g => !new Set(MUSCLE_HIERARCHY.flatMap(z => z.groups)).has(g)).map(g => (
                              <option key={g} value={g}>• {g}</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      <button
                        onClick={() => { setIsCustomGroup(true); setNewExGroup(''); }}
                        className="bg-blue-50 dark:bg-gray-700 text-blue-600 dark:text-cyan-400 px-3 py-2 rounded-xl font-bold text-sm hover:bg-blue-100 dark:hover:bg-gray-600 border border-blue-100 dark:border-gray-600 whitespace-nowrap transition-colors"
                      >
                        + New
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">{t('difficulty')}</label>
                  <select
                    className="w-full p-3 border dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white capitalize focus:outline-blue-500 dark:focus:border-cyan-500"
                    value={newExLevel}
                    onChange={e => setNewExLevel(e.target.value as any)}
                  >
                    <option value="beginner">{t('beginner')}</option>
                    <option value="intermediate">{t('intermediate')}</option>
                    <option value="advanced">{t('advanced')}</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Unit</label>
                  <select
                    className="w-full p-3 border dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white capitalize focus:outline-blue-500 dark:focus:border-cyan-500"
                    value={newExMeasurement}
                    onChange={e => setNewExMeasurement(e.target.value as any)}
                  >
                    <option value="reps">Reps</option>
                    <option value="time">Time (Seconds)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Equipaggiamento</label>
                  <select
                    className="w-full p-3 border dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white capitalize focus:outline-blue-500 dark:focus:border-cyan-500"
                    value={newExEquipment}
                    onChange={e => setNewExEquipment(e.target.value as Equipment)}
                  >
                    {Object.values(Equipment).map(eq => (
                      <option key={eq} value={eq}>{t(eq) || eq}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Caratteristiche</label>
                  <div className="flex items-center h-full gap-3 p-3 border dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900/50">
                    <input
                      type="checkbox"
                      id="isUnilateral"
                      checked={newExUnilateral}
                      onChange={e => setNewExUnilateral(e.target.checked)}
                      className="w-5 h-5 text-cyan-500 rounded border-gray-300 focus:ring-cyan-500 dark:border-gray-600 dark:bg-gray-700 dark:ring-offset-gray-900"
                    />
                    <label htmlFor="isUnilateral" className="text-sm font-bold text-gray-700 dark:text-gray-300 select-none">
                      Esercizio Unilaterale
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-cyan-500 uppercase mb-2 flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5" /> Benchmarks Scientifici (NSCA)
                </label>
                <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-3 leading-tight uppercase font-bold tracking-tight">
                    {newExNSCA ? "Esercizio collegato! L'atleta vedrà il suo livello di forza per questa categoria." : "Seleziona se questo esercizio è un riferimento della forza (es. Panca, Squat, Stacchi)."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: '', label: 'Nessuno' },
                      { id: 'Pettorali (Spinta)', label: 'Panca / Spinta' },
                      { id: 'Gambe (Accosciata)', label: 'Squat / Leg Press' },
                      { id: 'Gambe (Hinge)', label: 'Stacco / Hinge' },
                      { id: 'Spalle', label: 'Lento / OHP' },
                      { id: 'Dorso (Tirata)', label: 'Rematore / Lat' }
                    ].map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setNewExNSCA(cat.id)}
                        className={`text-[10px] font-bold px-3 py-2 rounded-xl border transition-all ${newExNSCA === cat.id
                            ? 'bg-cyan-500 text-gray-900 border-cyan-400 shadow-lg shadow-cyan-500/20'
                            : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                          }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">{t('description')}</label>
                <textarea
                  className="w-full p-3 border dark:border-gray-700 rounded-xl min-h-[80px] bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-blue-500 dark:focus:border-cyan-500"
                  placeholder="Technique instructions..."
                  value={newExDesc}
                  onChange={e => setNewExDesc(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Video URL (Optional)</label>
                <input
                  className="w-full p-3 border dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-blue-500 dark:focus:border-cyan-500"
                  placeholder="e.g. https://youtube.com/..."
                  value={newExVideo}
                  onChange={e => setNewExVideo(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                {editingExercise && (
                  <button
                    onClick={handleDeleteExercise}
                    className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-bold rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                    title={t('delete')}
                  >
                    <Trash2 className="w-5 h-5 mx-auto" />
                  </button>
                )}
                <Button fullWidth onClick={handleSaveExercise} className="dark:bg-cyan-500 dark:text-gray-900 dark:font-bold">
                  {editingExercise ? 'Save Changes' : t('new_exercise')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE/EDIT PLAN MODAL */}
      {showPlanModal && (
        <div className="absolute inset-0 bg-black/50 dark:bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 w-full h-[95%] overflow-hidden flex flex-col rounded-2xl shadow-2xl relative border border-transparent dark:border-gray-700 transition-colors">

            {/* Modal Header */}
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-gray-800 z-10 transition-colors">
              <h3 className="text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                <Calendar className="w-5 h-5 dark:text-cyan-400" /> {editingWorkoutId ? t('edit_plan') : t('create_plan')}
              </h3>
              <button onClick={closePlanModal}><X className="w-6 h-6 text-gray-400 dark:hover:text-white" /></button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-4 space-y-4 transition-colors">
              {/* Plan Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 block">{t('plan_name')}</label>
                  <input
                    className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    placeholder="e.g. Hypertrophy Phase 1"
                    value={newPlanName}
                    onChange={e => setNewPlanName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 block">{t('assign_client')}</label>
                  <select
                    className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    value={selectedClientId}
                    onChange={e => setSelectedClientId(e.target.value)}
                    disabled={!!editingWorkoutId} // Disable changing client when editing
                  >
                    <option value="">{t('select_client')}</option>
                    {clients.map(c => <option key={c.uid} value={c.uid}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 block">{t('plan_end_date')}</label>
                <input
                  type="date"
                  className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  value={planEndDate}
                  onChange={e => setPlanEndDate(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 block">{t('split_duration')}</label>
                <div className="flex items-center gap-4">
                  <input
                    type="range" min="1" max="7"
                    value={numDays}
                    onChange={e => setNumDays(parseInt(e.target.value))}
                    className="flex-1 accent-blue-600 dark:accent-cyan-400"
                  />
                  <span className="font-bold text-xl w-8 text-center text-gray-900 dark:text-white">{numDays}</span>
                </div>
              </div>

              {/* Day Tabs */}
              <div className="flex gap-2 overflow-x-auto pb-2">
                {Array.from({ length: numDays }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveDayTab(i)}
                    className={`px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap transition-colors ${activeDayTab === i
                      ? 'bg-blue-600 dark:bg-cyan-500 text-white dark:text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
                      }`}
                  >
                    {t('day')} {i + 1}
                  </button>
                ))}
              </div>

              {/* Active Day Content */}
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 min-h-[300px]">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-bold text-gray-700 dark:text-white">{t('day')} {activeDayTab + 1} {t('workout')}</h4>
                  <button
                    onClick={() => setShowExPicker(true)}
                    className="text-xs bg-blue-50 dark:bg-gray-700 text-blue-600 dark:text-cyan-400 font-bold px-3 py-1.5 rounded-full hover:bg-blue-100 dark:hover:bg-gray-600 transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> {t('add_exercise')}
                  </button>
                </div>

                {(!draftItems[activeDayTab] || draftItems[activeDayTab].length === 0) ? (
                  <div className="text-center py-10 text-gray-400 dark:text-gray-500 border-2 border-dashed border-gray-100 dark:border-gray-700 rounded-xl">
                    {t('tap_add_exercises')}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {draftItems[activeDayTab].map((item, idx) => {
                      const ex = exercises.find(e => e.id === item.exerciseId);
                      const isTimeBased = ex?.measurement === 'time';
                      const groupColors = getGroupColor(item.supersetGroup);
                      return (
                        <div key={idx} className={`p-3 rounded-xl border-l-4 ${item.supersetGroup ? `${groupColors.border} ${groupColors.bg}` : 'border-l-transparent bg-gray-50 dark:bg-gray-900'} border border-gray-200 dark:border-gray-700 transition-all`}>
                          {/* Exercise Header */}
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              {item.supersetGroup && (
                                <span className={`w-5 h-5 rounded-full ${groupColors.badge} text-[10px] font-black flex items-center justify-center`}>
                                  {item.supersetGroup}
                                </span>
                              )}
                              <span className="font-bold text-gray-900 dark:text-white text-sm">{ex?.name || t('unknown')}</span>
                              {isTimeBased && <Clock className="w-3 h-3 text-orange-500" />}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => toggleSuperset(activeDayTab, idx)}
                                className={`p-1 rounded transition-colors ${item.supersetGroup ? `${groupColors.text} bg-white dark:bg-gray-800` : 'text-gray-400 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                                title="Toggle Superset Group"
                              >
                                <Link2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => moveDraftItem(activeDayTab, idx, -1)}
                                disabled={idx === 0}
                                className="p-1 text-gray-400 hover:text-blue-500 disabled:opacity-20 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                              >
                                <ArrowUp className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => moveDraftItem(activeDayTab, idx, 1)}
                                disabled={idx === (draftItems[activeDayTab]?.length || 0) - 1}
                                className="p-1 text-gray-400 hover:text-blue-500 disabled:opacity-20 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                              >
                                <ArrowDown className="w-4 h-4" />
                              </button>
                              <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1"></div>
                              <button onClick={() => removeDraftItem(activeDayTab, idx)} className="text-gray-400 hover:text-red-500 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><X className="w-4 h-4" /></button>
                            </div>
                          </div>

                          {/* Inputs */}
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-[10px] text-gray-400 uppercase font-bold">Sets</label>
                              <input type="number" value={item.sets} onChange={e => updateDraftItem(activeDayTab, idx, 'sets', parseInt(e.target.value))} className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-1 text-center font-bold text-sm text-gray-900 dark:text-white" />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-400 uppercase font-bold">{isTimeBased ? t('seconds') : 'Reps'}</label>
                              <input type="number" value={item.reps} onChange={e => updateDraftItem(activeDayTab, idx, 'reps', parseInt(e.target.value))} className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-1 text-center font-bold text-sm text-gray-900 dark:text-white" />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-400 uppercase font-bold">{t('rest_s')}</label>
                              <input type="number" value={item.restSeconds} onChange={e => updateDraftItem(activeDayTab, idx, 'restSeconds', parseInt(e.target.value))} className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-1 text-center font-bold text-sm text-gray-900 dark:text-white" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 z-10">
              <Button fullWidth onClick={handleSavePlan} className="dark:bg-cyan-500 dark:text-gray-900 dark:font-bold">
                {editingWorkoutId ? t('update_plan') : t('save_assign')}
              </Button>
            </div>

            {/* Exercise Picker Modal Overlay */}
            {showExPicker && (
              <div className="absolute inset-0 bg-white dark:bg-gray-900 z-[60] flex flex-col animate-slide-up">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-gray-800 shrink-0">
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white">{t('select_exercise')}</h3>
                  <button onClick={() => setShowExPicker(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full"><X className="w-5 h-5 text-gray-500 dark:text-white" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900">
                  {MUSCLE_HIERARCHY.map((zone, idx) => {
                    const activeGroupsInZone = zone.groups.filter(g => exercisesByGroup[g]);
                    if (activeGroupsInZone.length === 0) return null;
                    return (
                      <div key={zone.key}>
                        <h4 className="text-sm font-bold text-gray-400 uppercase mb-2">{t(zone.key)}</h4>
                        {activeGroupsInZone.map(g => (
                          <div key={g} className="mb-3">
                            {exercisesByGroup[g].map(ex => (
                              <button
                                key={ex.id}
                                onClick={() => { addItemToDay(ex.id); setShowExPicker(false); }}
                                className="w-full text-left bg-white dark:bg-gray-800 p-3 mb-2 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex justify-between items-center hover:border-blue-500 dark:hover:border-cyan-500 transition-colors"
                              >
                                <span className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                  {ex.name}
                                  {ex.measurement === 'time' && <Clock className="w-3 h-3 text-gray-400" />}
                                </span>
                                <Plus className="w-4 h-4 text-blue-500 dark:text-cyan-400" />
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </>
  );
};
