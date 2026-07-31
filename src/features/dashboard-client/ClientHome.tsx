
import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { User, Workout, WorkoutItem, Exercise, BodyMeasurement, Log, ClientPlanSummary, WorkoutSession } from '../../types';

import { getActiveSession, ActiveSessionState } from '../../offline/indexedDB';
import { Button } from '../../components/Button';
import { WorkoutLogger } from '../workout/WorkoutLogger';
import { Trophy, Calendar, ChevronRight, Lock, ChevronLeft, Dumbbell, Play, History, Clock, Ruler, Plus, X, MessageSquare, Activity, ChevronDown, Info, CheckCircle, List, RotateCcw } from 'lucide-react';
import { calculate1RMEpley } from '../../core/domain/analytics';
import { EstimatorFactory } from '../../core/domain/estimators';
import { useTranslation } from '../../services/i18n';
import { ThemeToggle } from '../../components/ThemeToggle';
import { getLocalDatePart, getLocalTodayString, getWeekStart, getDaysDifference, formatFriendlyDate, formatShortMonthDay, formatShortWeekdayMonthDay, formatToLocaleDate, toLocalISOString } from '../../date';
import { AdherenceBarChart } from '../dashboard-pt/PTDashboard';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, AreaChart, Area, LineChart, Line, ReferenceLine, Cell } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { calculateSRPE, getSRPELabel, getStrengthLevel, StrengthResult } from '../../core/domain/coachingEngine';
import { ArchiveBanner, ArchiveStatus } from './ArchiveBanner';
import { DashboardSkeleton } from '../../components/Skeleton';
import { Log as DomainLog, resolveBodyweight } from '../../core/domain';
import { LogsRepository, SessionsRepository, UsersRepository, WorkoutsRepository, AuthRepository } from '../../repositories';

interface Props {
  user: User;
  onUpdateUser: (u: User) => void;
}

// sRPE (Foster Method) Chart
export const SRPEChart: React.FC<{ sessions: WorkoutSession[] }> = ({ sessions }) => {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);

  const chartData = useMemo(() => {
    // 1. Ordina temporalmente
    const sorted = [...sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // 2. Raggruppa per giorno e prendi il valore MASSIMO (Deduplicazione sessioni buggate)
    const dailyMap = new Map<string, number>();
    sorted.forEach(s => {
      const dateStr = formatShortMonthDay(s.date);
      const srpe = calculateSRPE(s);
      
      // Essendo sessioni duplicate dallo stesso log, prendiamo il report col carico maggiore della giornata
      dailyMap.set(dateStr, Math.max(dailyMap.get(dateStr) || 0, srpe));
    });

    // 3. Formatta i dati per Recharts
    const combined = Array.from(dailyMap.entries()).map(([dateStr, totalSrpe]) => ({
      date: dateStr,
      val: Math.round(totalSrpe),
      fillColor: totalSrpe < 150 ? '#22c55e' : totalSrpe < 300 ? '#06b6d4' : totalSrpe < 450 ? '#f97316' : '#ef4444'
    }));

    // Ritorniamo gli ultimi 8 giorni attivi
    return combined.slice(-8);
  }, [sessions]);

  if (chartData.length === 0) return null;
  const latestSRPE = chartData[chartData.length - 1].val;
  const latestLabel = getSRPELabel(latestSRPE);

  return (
    <div className="glass-card p-5 transition-colors flex flex-col mt-6 relative h-72">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-cyan-500" /> sRPE Internal Load
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-2xl font-black text-gray-900 dark:text-white">{latestSRPE}</p>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${latestLabel.color.replace('bg-', 'text-').replace('text-', 'bg-opacity-20 text-')}`}>{latestLabel.label}</span>
          </div>
        </div>
        <button onClick={() => setShowInfo(true)} className="p-1.5 rounded-full text-gray-400 hover:text-cyan-500 bg-gray-100 dark:bg-gray-700 transition-colors shrink-0">
          <Info className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" strokeOpacity={0.2} />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#1f2937', color: '#fff' }}
              itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
              labelStyle={{ color: '#9ca3af', fontSize: '10px' }}
              formatter={(value: number) => [`${value} sRPE`, 'Load']}
            />
            <ReferenceLine y={300} stroke="#f97316" strokeDasharray="3 3" strokeOpacity={0.5} label={{ position: 'insideTopLeft', value: 'Duro', fill: '#f97316', fontSize: 10 }} />
            <ReferenceLine y={450} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.5} label={{ position: 'insideTopLeft', value: 'Limite', fill: '#ef4444', fontSize: 10 }} />
            <Bar dataKey="val" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fillColor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {typeof window !== 'undefined' && createPortal(
      <AnimatePresence>{showInfo && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 dark:bg-black/80 dark:backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', duration: 0.4 }} className="glass-panel w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-3xl p-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-700 pb-3 mb-4">
               <h3 className="font-bold text-lg text-white flex items-center gap-2"><Activity className="w-5 h-5 text-cyan-500" /> Metodo Foster</h3>
               <button onClick={() => setShowInfo(false)} className="p-2"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="text-sm text-gray-300 space-y-3">
              <p>Il Carico Interno (sRPE) quantifica l'impatto fisiologico reale dell'allenamento sul tuo corpo.</p>
              <p className="bg-gray-900 p-3 rounded-xl font-mono text-center">sRPE = Durata (min) × RPE Medio</p>
              <ul className="list-disc pl-4 space-y-1">
                <li className="text-cyan-400">&lt; 300: Optimale / Moderato</li>
                <li className="text-orange-400">300-450: Affaticante / Duro</li>
                <li className="text-red-400">&gt; 450: Limite / Molto duro</li>
              </ul>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      , document.body)}
    </div>
  );
};

// NSCA Strength Badge Chart
export const StrengthLevelBadge: React.FC<{ logs: Log[], exercises: Record<string, Exercise>, user: User }> = ({ logs, exercises, user }) => {
  const { t } = useTranslation();
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [showInfo, setShowInfo] = useState<boolean>(false);

  const strengthData = useMemo(() => {
    if (!user.weight || user.weight <= 0) return [];

    const results: StrengthResult[] = [];

    logs.forEach(log => {
      if (log.completed === false || !log.weight || !log.reps) return;
      const ex = exercises[log.exerciseId];
      if (!ex) return;

      const rm = log.weight * (1 + 0.0333 * log.reps);
      const res = getStrengthLevel(rm, user.weight!, ex);

      if (res) {
        const existing = results.find(r => r.categoryName === res.categoryName);
        if (!existing || res.ratio > existing.ratio) {
          if (existing) {
             Object.assign(existing, res);
          } else {
             results.push(res);
          }
        }
      }
    });

    return results.sort((a,b) => b.ratio - a.ratio);
  }, [logs, exercises, user.weight]);

  useEffect(() => {
    if (!selectedGroup && strengthData.length > 0) {
      setSelectedGroup(strengthData[0].categoryName);
    }
  }, [strengthData, selectedGroup]);

  if (!user.weight || user.weight <= 0) {
     return (
        <div className="glass-card p-5 mt-6 text-center">
            <Trophy className="w-8 h-8 text-yellow-500 mx-auto mb-2 opacity-50" />
            <p className="text-gray-400 font-bold text-sm mb-2">{t('nsca_locked_title')}</p>
            <p className="text-xs text-gray-500">{t('nsca_locked_desc')}</p>
        </div>
     );
  }

  if (strengthData.length === 0) return null;

  const currentData = strengthData.find(d => d.categoryName === selectedGroup) || strengthData[0];

  return (
    <div className="glass-card p-5 mt-6 relative">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5 text-yellow-500" /> {t('nsca_levels')}</p>
          <div className="mt-2 flex items-center gap-2">
             <div className="bg-yellow-500 p-2 rounded-xl text-black font-black uppercase tracking-tighter shadow-lg shadow-yellow-500/20">{currentData.level}</div>
             {currentData.isMachine && <span className="bg-orange-500/20 text-orange-400 text-[10px] px-2 py-0.5 rounded font-bold uppercase transition" title="Basato su esercizio guidato">{t('nsca_machine_warning')}</span>}
          </div>
        </div>
        <div className="flex gap-2">
            <select
              value={selectedGroup}
              onChange={e => setSelectedGroup(e.target.value)}
              className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-xs font-bold rounded-lg p-2 flex-1 focus:ring-cyan-500 focus:border-cyan-500 max-w-[140px]"
            >
              {strengthData.map(d => (
                <option value={d.categoryName} key={d.categoryName}>{d.categoryName}</option>
              ))}
            </select>
            <button onClick={() => setShowInfo(true)} className="p-1.5 rounded-full text-gray-400 hover:text-cyan-500 bg-gray-100 dark:bg-gray-700 transition-colors shrink-0">
          <Info className="w-5 h-5" />
        </button>
        </div>
      </div>

      <div className="border-l-2 border-cyan-500 pl-3 mb-4">
         <p className="text-sm text-gray-300">
            {t('nsca_you_are_strong')} <strong className="text-white">{currentData.ratio.toFixed(2)}x</strong> {t('nsca_your_weight')}
            {currentData.nextThreshold && ` ${t('nsca_next_level')} ${currentData.nextThreshold.toFixed(2)}x.`}
         </p>
         {currentData.exerciseName && (
            <p className="text-[10px] text-gray-500 mt-1 uppercase font-bold tracking-wider">
               {t('nsca_based_on')}: {currentData.exerciseName} (1RM = {currentData.rmUsed?.toFixed(0)}kg)
            </p>
         )}
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden mb-1 relative">
         <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${currentData.ratioProgress}%` }} />
      </div>
      <div className="flex justify-between text-[8px] font-bold text-gray-500 uppercase tracking-wider mb-4 px-1">
         <span>Beg</span>
         <span>Nov</span>
         <span>Int</span>
         <span>Adv</span>
         <span>Elite</span>
      </div>

      {strengthData.length > 1 && (
         <div className="bg-gray-900/50 rounded-xl p-3 border border-gray-800">
            <p className="text-[10px] font-bold text-gray-500 uppercase mb-2">{t('nsca_others_detected')}</p>
            <div className="space-y-1.5">
               {strengthData.filter(d => d.categoryName !== selectedGroup).map(d => (
                  <div key={d.categoryName} className="flex justify-between items-center text-xs">
                     <span className="text-gray-400 font-medium">{d.categoryName}</span>
                     <span className={`font-bold px-1.5 rounded ${d.level === 'Elite' || d.level === 'Advanced' ? 'text-yellow-400 bg-yellow-900/30' : 'text-gray-200 bg-gray-800'}`}>{d.level}</span>
                  </div>
               ))}
            </div>
         </div>
      )}

      {/* Info Modal */}
      {typeof window !== 'undefined' && createPortal(
      <AnimatePresence>{showInfo && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="glass-panel max-h-[85vh] overflow-y-auto rounded-3xl max-w-sm w-full p-6 shadow-2xl relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-yellow-500/20 p-2 rounded-xl text-yellow-500">
                <Trophy className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">{t('nsca_standard')}</h3>
            </div>
            
            <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
              <p dangerouslySetInnerHTML={{ __html: t('nsca_how_it_works') }} />
              
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-700 text-xs">
                <p className="font-bold mb-2">{t('nsca_levels_title')}</p>
                <ul className="space-y-1 text-gray-500 dark:text-gray-400">
                  <li><span className="font-bold text-gray-700 dark:text-gray-200">Novellino:</span> {t('nsca_level_0_desc')}</li>
                  <li><span className="font-bold text-gray-700 dark:text-gray-200">Novice:</span> {t('nsca_level_1_desc')}</li>
                  <li><span className="font-bold text-gray-700 dark:text-gray-200">Intermediate:</span> {t('nsca_level_2_desc')}</li>
                  <li><span className="font-bold text-gray-700 dark:text-gray-200">Advanced:</span> {t('nsca_level_3_desc')}</li>
                  <li><span className="font-bold text-gray-700 dark:text-gray-200">Elite:</span> {t('nsca_level_4_desc')}</li>
                </ul>
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
                   <p className="font-bold mb-1">{t('nsca_scientific_method')}</p>
                   <p className="text-gray-500 dark:text-gray-400">{t('nsca_scientific_desc')}<br/><code>1RM = Carico × (1 + 0.0333 × Ripetizioni)</code></p>
                   <p className="text-gray-500 dark:text-gray-400 mt-1">{t('nsca_scientific_desc2')}</p>
                </div>
              </div>

              <div className="flex gap-2 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
                 <span className="text-orange-500">⚠️</span>
                 <p className="text-xs text-orange-800 dark:text-orange-300">
                    {t('nsca_machine_desc')}
                 </p>
              </div>
            </div>

            <Button fullWidth onClick={() => setShowInfo(false)} className="mt-6 bg-gray-900 text-white">
              Ho capito
            </Button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>
      , document.body)}
    </div>
  );
};

// Recharts Weekly Volume Chart
const WeeklyVolumeChart: React.FC<{ logs: Log[], sessions: WorkoutSession[], exercises: Record<string, Exercise>, user: User }> = ({ logs, sessions, exercises, user }) => {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);
  const { chartData, currentVolume, delta } = useMemo(() => {
    const weeksMap = new Map<number, number>();
    const today = new Date();
    const currentWeekStart = getWeekStart(today).getTime();

    // Initialize last 6 weeks with 0
    for (let i = 5; i >= 0; i--) {
      const w = new Date(currentWeekStart);
      w.setDate(w.getDate() - (i * 7));
      weeksMap.set(w.getTime(), 0);
    }

    const handledDates = new Set<string>();

    logs.forEach(l => {
      if (l.completed === false || l.id?.startsWith('temp_skip_')) return;

      const logWeekStart = getWeekStart(l.date).getTime();

      if (weeksMap.has(logWeekStart)) {
        const ex = exercises[l.exerciseId] || { isBodyweight: false, isUnilateral: false };
        const domainLog = new DomainLog(l);
        const logBw = resolveBodyweight(l.bodyweightAtLog, user.weight);
        const logVol = domainLog.calculateVolume(ex, logBw);
        weeksMap.set(logWeekStart, (weeksMap.get(logWeekStart) || 0) + logVol);
      }
    });

    // Convert Map to sorted array
    const sortedWeeks = Array.from(weeksMap.entries()).sort((a, b) => a[0] - b[0]);

    const chartData = sortedWeeks.map(([ts, val]) => {
      const start = new Date(ts);
      const end = new Date(ts);
      end.setDate(end.getDate() + 6); // End is Sunday (Start + 6 days)

      return {
        name: `${formatShortMonthDay(start)} - ${formatShortMonthDay(end)}`,
        volume: val
      };
    });

    const values = sortedWeeks.map(x => x[1]);
    const current = values[values.length - 1];
    const prev = values[values.length - 2] || 0;
    const delta = prev > 0 ? ((current - prev) / prev) * 100 : 0;

    return {
      chartData,
      currentVolume: current,
      delta
    };
  }, [logs]);

  return (
    <div className="glass-card p-5 transition-colors flex flex-col h-64 relative">
      <div className="flex justify-between items-start mb-4 shrink-0">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('weekly_volume')}</p>
          <p className="text-2xl font-black text-gray-900 dark:text-white">
            {(currentVolume / 1000).toFixed(1)}k <span className="text-sm font-medium text-gray-500">{t('kg')}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button onClick={() => setShowInfo(true)} className="p-1.5 rounded-full text-gray-400 hover:text-cyan-500 bg-gray-100 dark:bg-gray-700 transition-colors shrink-0">
          <Info className="w-5 h-5" />
        </button>
          <div className={`text-xs font-bold px-2 py-1 rounded-md ${delta >= 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}>
            {delta > 0 ? '+' : ''}{delta.toFixed(0)}% {t('vs_last_wk')}
          </div>
        </div>
      </div>

      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" strokeOpacity={0.2} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 9, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <Tooltip
              cursor={{ fill: 'rgba(100,100,100,0.1)' }}
              contentStyle={{
                borderRadius: '12px',
                border: 'none',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                backgroundColor: '#1f2937',
                color: '#fff'
              }}
              itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
              labelStyle={{ color: '#9ca3af', fontSize: '10px', marginBottom: '4px' }}
              formatter={(value: number) => [`${(value / 1000).toFixed(1)}k ${t('kg')}`, t('volume')]}
            />
            <Bar
              dataKey="volume"
              fill="#22d3ee"
              radius={[4, 4, 0, 0]}
              activeBar={{ fill: '#06b6d4' }}
            />
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
              <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2"><Info className="w-5 h-5 text-cyan-500" /> {t('info_volume_title')}</h3>
              <button onClick={() => setShowInfo(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400 dark:hover:text-white" /></button>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300 space-y-3">
              <p>{t('info_volume_desc')}</p>
              <p className="bg-gray-50 dark:bg-gray-900 p-3 rounded-xl font-mono text-center">{t('info_volume_calc')}</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>{t('info_volume_list1')}</li>
                <li>{t('info_volume_list2')}</li>
              </ul>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      , document.body)}
    </div>
  );
};

// Consistency Heatmap (GitHub Style)
const ConsistencyHeatmap: React.FC<{ logs: Log[], sessions: WorkoutSession[], exercises: Record<string, Exercise>, user: User }> = ({ logs, sessions, exercises, user }) => {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);
  const { days, maxVolume } = useMemo(() => {
    const today = new Date();
    const logsByDate: Record<string, number> = {};
    const handledDates = new Set<string>();

    sessions.forEach(s => {
      const ds = getLocalDatePart(s.date);
      if (!ds) return;
      handledDates.add(ds);
    });

    logs.forEach(l => {
      const dateStr = getLocalDatePart(l.date);
      if (!dateStr || l.id?.startsWith('temp_')) return;
      if (l.completed === false) return;

      const ex = exercises[l.exerciseId] || { isBodyweight: false, isUnilateral: false };
      const domainLog = new DomainLog(l);
      const logBw = resolveBodyweight(l.bodyweightAtLog, user.weight);
      const logVol = domainLog.calculateVolume(ex, logBw);
      logsByDate[dateStr] = (logsByDate[dateStr] || 0) + logVol;
      handledDates.add(dateStr);
    });

    let maxV = 1;
    Object.values(logsByDate).forEach(v => { if (v > maxV) maxV = v; });

    const currentDayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const totalWks = 14; // Give it 14 weeks to fill screen width
    const totalDays = totalWks * 7;

    const startDate = new Date(today);
    startDate.setDate(today.getDate() - currentDayIndex - ((totalWks - 1) * 7));

    const gridDays = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = getLocalDatePart(d);
      const vol = logsByDate[dateStr] || 0;
      gridDays.push({
        date: d,
        vol,
        isFuture: d > today
      });
    }

    return { days: gridDays, maxVolume: maxV };
  }, [logs]);

  const getIntensityClass = (vol: number) => {
    if (vol === 0) return 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700/50';
    const ratio = vol / maxVolume;
    if (ratio < 0.25) return 'bg-cyan-200 dark:bg-cyan-900/60 border-cyan-300 dark:border-cyan-800';
    if (ratio < 0.5) return 'bg-cyan-300 dark:bg-cyan-700 border-cyan-400 dark:border-cyan-600';
    if (ratio < 0.75) return 'bg-cyan-400 dark:bg-cyan-500 border-cyan-500 dark:border-cyan-400';
    return 'bg-cyan-500 dark:bg-cyan-400 border-cyan-600 dark:border-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.4)]';
  };

  return (
    <div className="glass-card p-5 transition-colors flex flex-col mt-6 relative">
      <div className="flex justify-between items-start mb-4 shrink-0">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-cyan-500" /> {t('consistency_heatmap')}</p>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('activity_last_14_weeks')}</p>
        </div>
        <button onClick={() => setShowInfo(true)} className="p-1.5 rounded-full text-gray-400 hover:text-cyan-500 bg-gray-100 dark:bg-gray-700 transition-colors shrink-0">
          <Info className="w-5 h-5" />
        </button>
      </div>

      <div className="w-full overflow-x-auto pb-2 scrollbar-none" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <div className="min-w-fit">
          <div className="grid grid-rows-7 grid-flow-col gap-1.5">
            {days.map((day, i) => (
              <div
                key={i}
                title={day.isFuture ? '' : `${formatToLocaleDate(day.date)}: ${(day.vol > 0 ? (day.vol / 1000).toFixed(1) + 'k ' + t('kg') : t('rest'))}`}
                className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-sm border ${day.isFuture ? 'bg-transparent border-transparent' : getIntensityClass(day.vol)} transition-colors`}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end items-center gap-1.5 mt-3 text-[10px] uppercase font-bold text-gray-400">
        <span>{t('less')}</span>
        <div className="w-2.5 h-2.5 rounded-sm bg-gray-100 dark:bg-gray-800"></div>
        <div className="w-2.5 h-2.5 rounded-sm bg-cyan-200 dark:bg-cyan-900/60"></div>
        <div className="w-2.5 h-2.5 rounded-sm bg-cyan-300 dark:bg-cyan-700"></div>
        <div className="w-2.5 h-2.5 rounded-sm bg-cyan-400 dark:bg-cyan-500"></div>
        <div className="w-2.5 h-2.5 rounded-sm bg-cyan-500 dark:bg-cyan-400"></div>
        <span>{t('more')}</span>
      </div>

      {/* Info Modal */}
      {typeof window !== 'undefined' && createPortal(
      <AnimatePresence>{showInfo && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 dark:bg-black/80 dark:backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', duration: 0.4 }} className="glass-panel w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-3xl p-6 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-700 pb-3">
              <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2"><Info className="w-5 h-5 text-cyan-500" /> {t('info_heat_title')}</h3>
              <button onClick={() => setShowInfo(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400 dark:hover:text-white" /></button>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300 space-y-3">
              <p>{t('info_heat_desc')}</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>{t('info_heat_l1')}</li>
                <li>{t('info_heat_l2')}</li>
                <li>{t('info_heat_l3')}</li>
              </ul>
              <p className="italic">{t('info_heat_end')}</p>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      , document.body)}
    </div>
  );
};

// Acute-to-Chronic Workload Ratio (ACWR) Chart
export const ACWRChart: React.FC<{ logs: Log[], sessions: WorkoutSession[], exercises: Record<string, Exercise>, user: User }> = ({ logs, sessions, exercises, user }) => {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);

  const { acute, chronic, acwr, status, color } = useMemo(() => {
    const today = new Date();

    let acuteVol = 0; // last 7 days
    let chronicVol = 0; // last 28 days
    // BUG FIX RETROATTIVO: Ignoriamo il volume delle "sessions" perché quelle salvate
    // prima dei nostri bugfix potrebbero contenere volumi duplicati e astronomici per la stessa giornata.
    // Calcoliamo tutto dai singoli "logs" atomici, così il Ratio è perfettamente netto.

    logs.forEach(l => {
      // FIX: Escludi serie saltate (completed=false) e log offline "fantasma" rimasti bloccati in db
      if (l.completed === false || l.id?.startsWith('temp_skip_')) return;

      const diffDays = getDaysDifference(today, l.date);
      if (isNaN(diffDays)) return;

      const ex = exercises[l.exerciseId] || { isBodyweight: false, isUnilateral: false };
      const domainLog = new DomainLog(l);
      const logBw = resolveBodyweight(l.bodyweightAtLog, user.weight);
      const vol = domainLog.calculateVolume(ex, logBw);

      if (diffDays <= 7) acuteVol += vol;
      if (diffDays <= 28) chronicVol += vol;
    });

    const avgChronicVol = chronicVol / 4;
    const ratio = avgChronicVol > 0 ? (acuteVol / avgChronicVol) : 0;

    let stat = 'Optimal';
    let col = 'text-green-500 bg-green-500';

    if (ratio === 0) {
      stat = 'No Data';
      col = 'text-gray-500 bg-gray-500';
    } else if (ratio < 0.8) {
      stat = 'Under Training';
      col = 'text-blue-500 bg-blue-500';
    } else if (ratio > 1.3) {
      stat = 'Danger Zone';
      col = 'text-red-500 bg-red-500';
    }

    return { acute: acuteVol, chronic: avgChronicVol, acwr: ratio, status: stat, color: col };
  }, [logs]);

  const dotPosition = Math.min((acwr / 2.0) * 100, 100);

  return (
    <div className="glass-card p-5 transition-colors flex flex-col mt-6 relative">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-orange-500" /> {t('acwr_title')}
          </p>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('acwr_subtitle')}</p>
        </div>
        <button onClick={() => setShowInfo(true)} className="p-1.5 rounded-full text-gray-400 hover:text-cyan-500 bg-gray-100 dark:bg-gray-700 transition-colors shrink-0">
          <Info className="w-5 h-5" />
        </button>
      </div>

      <div className="flex justify-between items-end mb-6">
        <div>
          <p className="text-4xl font-black text-gray-900 dark:text-white">
            {acwr.toFixed(2)}
          </p>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${color.split(' ')[0]}`}>{status}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">{t('weekly_load')}</p>
          <p className="text-sm font-bold text-gray-900 dark:text-gray-300">{(acute / 1000).toFixed(1)}k <span className="text-[10px] text-gray-500">{t('kg')} ({t('acute')})</span></p>
          <p className="text-sm font-bold text-gray-900 dark:text-gray-300">{(chronic / 1000).toFixed(1)}k <span className="text-[10px] text-gray-500">{t('kg')} ({t('chronic')})</span></p>
        </div>
      </div>

      {/* Scale Graphic */}
      <div className="relative w-full h-4 bg-gradient-to-r from-blue-400 via-green-400 to-red-500 rounded-full mt-2">
        <div className="absolute top-0 bottom-0 left-[40%] right-[35%] border-x-2 border-white/40 z-0"></div>
        <motion.div
          initial={{ left: '0%' }}
          animate={{ left: `${dotPosition}%` }}
          transition={{ type: 'spring', stiffness: 50 }}
          className="absolute top-1/2 -mt-3 -ml-3 w-6 h-6 bg-white rounded-full shadow-md border-[3px] border-gray-900 z-10"
        ></motion.div>
      </div>
      <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase mt-2">
        <span>0.0</span>
        <span>0.8</span>
        <span>1.3</span>
        <span>2.0+</span>
      </div>

      {/* Info Modal */}
      {typeof window !== 'undefined' && createPortal(
      <AnimatePresence>{showInfo && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 dark:bg-black/80 dark:backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', duration: 0.4 }} className="glass-panel w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-3xl p-6 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-700 pb-3">
              <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2"><Info className="w-5 h-5 text-cyan-500" /> {t('info_acwr_title')}</h3>
              <button onClick={() => setShowInfo(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400 dark:hover:text-white" /></button>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300 space-y-4">
              <p>{t('info_acwr_desc')}</p>
              <p><strong>🔥 {t('info_acwr_acute')}</strong></p>
              <p><strong>🔋 {t('info_acwr_chronic')}</strong></p>
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl space-y-2 mt-4">
                <p className="text-xs">{t('info_acwr_low')}</p>
                <p className="text-xs">{t('info_acwr_sweet')}</p>
                <p className="text-xs">{t('info_acwr_danger')}</p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      , document.body)}
    </div>
  );
};

// Recharts Muscle Group Distribution Chart
export const MuscleGroupRadarChart: React.FC<{ logs: Log[], exercises: Record<string, Exercise> }> = ({ logs, exercises }) => {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);

  const chartData = useMemo(() => {
    const groups: Record<string, number> = {};

    logs.forEach(log => {
      // BUG 4 FIX: Escludi serie saltate (completed=false), temp_skip_ e log privi di esercizio.
      // Senza questo filtro ogni skip conta come una serie nel radar, gonfiando
      // la distribuzione muscolare con zeri e distorcendo il confronto tra gruppi.
      if (log.completed === false || log.id?.startsWith('temp_skip_')) return;
      const ex = exercises[log.exerciseId];
      if (!ex) return;
      const group = ex.groupId || 'Other';
      groups[group] = (groups[group] || 0) + 1; // Counting sets
    });

    return Object.entries(groups)
      .map(([name, value]) => ({
        name: t('group_' + name.toLowerCase().replace(' ', '_')) || name,
        sets: value
      }))
      .sort((a, b) => b.sets - a.sets); // Sort to make the radar shape more consistent
  }, [logs, exercises, t]);

  if (chartData.length === 0) return null;

  return (
    <div className="glass-card p-5 transition-colors flex flex-col h-64 relative">
      <div className="flex justify-between items-start mb-2 shrink-0">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('muscle_distribution')}</p>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('total_sets_group')}</p>
        </div>
        <button onClick={() => setShowInfo(true)} className="p-1.5 rounded-full text-gray-400 hover:text-cyan-500 bg-gray-100 dark:bg-gray-700 transition-colors shrink-0">
          <Info className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
            <PolarGrid stroke="#374151" strokeOpacity={0.3} />
            <PolarAngleAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 'bold' }} />
            <PolarRadiusAxis angle={30} domain={[0, 'dataMax']} tick={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                borderRadius: '12px',
                border: 'none',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                backgroundColor: '#1f2937',
                color: '#fff'
              }}
              itemStyle={{ color: '#22d3ee', fontSize: '12px', fontWeight: 'bold' }}
              formatter={(value: number) => [`${value} ${t('sets').toLowerCase()}`, t('volume')]}
            />
            <Radar name={t('sets')} dataKey="sets" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.5} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Info Modal */}
      {typeof window !== 'undefined' && createPortal(
      <AnimatePresence>{showInfo && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 dark:bg-black/80 dark:backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', duration: 0.4 }} className="glass-panel w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-3xl p-6 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-700 pb-3">
              <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2"><Info className="w-5 h-5 text-cyan-500" /> {t('info_radar_title')}</h3>
              <button onClick={() => setShowInfo(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400 dark:hover:text-white" /></button>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300 space-y-3">
              <p>{t('info_radar_desc')}</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>{t('info_radar_l1')}</li>
                <li>{t('info_radar_l2')}</li>
              </ul>
              <p className="italic">{t('info_radar_end')}</p>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      , document.body)}
    </div>
  );
};

// Recharts Strength Progression Chart (1RM)
const StrengthProgressionChart: React.FC<{ logs: Log[], exercises: Record<string, Exercise>, onOpenPRModal?: () => void }> = ({ logs, exercises, onOpenPRModal }) => {
  const { t } = useTranslation();
  const [selectedExId, setSelectedExId] = useState<string>('');
  const [showInfo, setShowInfo] = useState(false);

  // Group logs by exercise and calculate 1RM for each session
  const exerciseData = useMemo(() => {
    const data: Record<string, { date: string, rm: number, realRM?: number, timestamp: number }[]> = {};

    logs.forEach(log => {
      // BUG 4 FIX: Escludi serie saltate (completed=false) e serie senza dati validi.
      // Un log skip ha weight=0, reps=0 → produce un 1RM di 0 che appiattisce il grafico
      // e crea falsi punti minimi nella progressione di forza.
      if (log.completed === false) return;
      if (!log.weight || !log.reps) return; // Skip cardio or empty

      // AI Coaching: Selezione dinamica formula massimale (Fase 12)
      const estimator = EstimatorFactory.getBestEstimator(log.reps);
      const rm = estimator.estimate1RM(log.weight, log.reps);
      const isReal1RM = log.reps === 1;
      const tsDate = new Date(log.date);
      if (isNaN(tsDate.getTime())) return;

      const dateStr = formatShortMonthDay(log.date);

      if (!data[log.exerciseId]) data[log.exerciseId] = [];

      // Group by date, keeping the max 1RM for that day
      const existingDay = data[log.exerciseId].find(d => d.date === dateStr);
      if (existingDay) {
        if (rm > existingDay.rm) existingDay.rm = rm;
        if (isReal1RM && (existingDay.realRM === undefined || log.weight > existingDay.realRM)) {
          existingDay.realRM = log.weight;
        }
      } else {
        data[log.exerciseId].push({ 
          date: dateStr, 
          rm, 
          realRM: isReal1RM ? log.weight : undefined,
          timestamp: tsDate.getTime() 
        });
      }
    });

    // Filter out exercises with less than 2 data points and sort by date
    const validExs: Record<string, any[]> = {};
    Object.entries(data).forEach(([id, points]) => {
      if (points.length >= 2) {
        validExs[id] = points.sort((a, b) => a.timestamp - b.timestamp).map(p => ({ 
          date: p.date, 
          rm: Math.round(p.rm),
          realRM: p.realRM !== undefined ? Math.round(p.realRM) : null
        }));
      }
    });

    return validExs;
  }, [logs]);

  // Available exercises for dropdown
  const availableExs = useMemo(() => {
    return Object.keys(exerciseData).map(id => ({
      id,
      name: exercises[id]?.name || 'Unknown Exercise',
      logsCount: exerciseData[id].length
    })).sort((a, b) => b.logsCount - a.logsCount);
  }, [exerciseData, exercises]);

  // Select default exercise if none selected
  useEffect(() => {
    if (!selectedExId && availableExs.length > 0) {
      setSelectedExId(availableExs[0].id);
    }
  }, [availableExs, selectedExId]);

  if (availableExs.length === 0) return null;

  const chartData = selectedExId ? exerciseData[selectedExId] : [];
  const currentRM = chartData.length > 0 ? chartData[chartData.length - 1].rm : 0;
  const startRM = chartData.length > 0 ? chartData[0].rm : 0;
  const delta = currentRM - startRM;

  return (
    <div className="glass-card p-5 transition-colors flex flex-col h-72 mb-6 mt-6">
      <div className="flex justify-between items-start mb-4 shrink-0 gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('strength_progression')}</p>
            <span className="text-[10px] bg-cyan-500/10 text-cyan-500 dark:text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/20" title="Il grafico dei massimali usa l'AI Dynamic Estimator (seleziona automaticamente Epley, Brzycki o Lombardi in base alle rep per darti la stima più precisa possibile).">
              AI Dynamic Estimator
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1 flex-wrap">
            <p className="text-2xl font-black text-gray-900 dark:text-white">
              {currentRM} <span className="text-sm font-medium text-gray-500">{t('kg')} 1RM</span>
            </p>
            <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${delta >= 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}>
              {delta > 0 ? '+' : ''}{delta}{t('kg')}
            </div>
          </div>
        </div>

        {onOpenPRModal && (
          <button onClick={onOpenPRModal} className="px-3 py-1.5 bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 text-xs font-bold rounded-lg shrink-0 flex items-center gap-1 transition-colors">
            <Trophy className="w-3.5 h-3.5" /> Testa PR
          </button>
        )}
        <select
          value={selectedExId}
          onChange={e => setSelectedExId(e.target.value)}
          className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-xs font-bold rounded-lg p-2 focus:ring-cyan-500 focus:border-cyan-500 w-32 truncate shrink-0"
        >
          {availableExs.map(ex => (
            <option value={ex.id} key={ex.id}>{ex.name}</option>
          ))}
        </select>
        <button onClick={() => setShowInfo(true)} className="p-1.5 rounded-full text-gray-400 hover:text-cyan-500 bg-gray-100 dark:bg-gray-700 transition-colors shrink-0">
          <Info className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" strokeOpacity={0.2} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              minTickGap={20}
            />
              <YAxis
              domain={['dataMin - 5', 'dataMax + 5']}
              tick={{ fontSize: 9, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '12px',
                border: 'none',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                backgroundColor: '#1f2937',
                color: '#fff'
              }}
              itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
              labelStyle={{ color: '#9ca3af', fontSize: '10px', marginBottom: '4px' }}
              formatter={(value: number, name: string) => {
                if (name === 'rm') return [`${value} ${t('kg')}`, t('est_1rm') || '1RM Stimato'];
                if (name === 'realRM') return [`${value} ${t('kg')}`, '1RM Reale'];
                return [`${value} ${t('kg')}`, name];
              }}
            />
            <Line type="monotone" dataKey="rm" stroke="#a855f7" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#1f2937' }} activeDot={{ r: 6, fill: '#a855f7' }} connectNulls={true} />
            <Line type="stepAfter" dataKey="realRM" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4, strokeWidth: 2, fill: '#1f2937', stroke: '#ef4444' }} activeDot={{ r: 6, fill: '#ef4444' }} connectNulls={true} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Info Modal */}
      {typeof window !== 'undefined' && createPortal(
      <AnimatePresence>{showInfo && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 dark:bg-black/80 dark:backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', duration: 0.4 }} className="glass-panel w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-3xl p-6 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-700 pb-3">
              <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2"><Info className="w-5 h-5 text-cyan-500" /> {t('info_1rm_title')}</h3>
              <button onClick={() => setShowInfo(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400 dark:hover:text-white" /></button>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300 space-y-3">
              <p>{t('info_1rm_desc')}</p>
              <p>{t('info_1rm_desc2')}</p>
              <p className="bg-gray-50 dark:bg-gray-900 p-3 rounded-xl font-mono text-center">{t('info_1rm_calc')}</p>
              <p>{t('info_1rm_end')}</p>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      , document.body)}
    </div>
  );
};

// Recharts Weight Trend Chart
export const MeasurementsTrendChart: React.FC<{ measurements: BodyMeasurement[] }> = ({ measurements }) => {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<keyof BodyMeasurement>('weight');

  const metricLabelMap: Record<string, string> = {
    weight: t('meas_weight'),
    neck: t('meas_neck'),
    shoulders: t('meas_shoulders'),
    chest: t('meas_chest'),
    bicep: t('meas_arm'),
    forearm: t('meas_forearm'),
    waist: t('meas_waist'),
    hips: t('meas_hips'),
    thigh: t('meas_thigh'),
    lowerThigh: t('meas_lower_thigh'),
    calf: t('meas_calf')
  };

  const chartData = useMemo(() => {
    if (!measurements || measurements.length === 0) return [];

    // Sort measurements chronologically
    const sorted = [...measurements].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return sorted.map(m => ({
      date: formatShortMonthDay(m.date),
      value: Number(m[selectedMetric]) || 0,
      fullDate: m.date
    })).filter(d => d.value > 0);
  }, [measurements, selectedMetric]);

  const hasEnoughData = chartData.length >= 2;

  // Calculate delta only if we have data
  const firstValue = hasEnoughData ? chartData[0].value : 0;
  const lastValue = hasEnoughData ? chartData[chartData.length - 1].value : 0;
  const delta = lastValue - firstValue;
  const unit = selectedMetric === 'weight' ? t('kg') : 'cm';

  return (
    <div className="glass-card p-5 transition-colors flex flex-col h-72 mb-6 relative z-0">
      <div className="flex justify-between items-start mb-4 shrink-0">
        <div>
          <div className="flex gap-2 items-center mb-1 relative z-10">
            <select
              value={selectedMetric as string}
              onChange={(e) => setSelectedMetric(e.target.value as keyof BodyMeasurement)}
              className="text-[10px] font-bold text-blue-600 dark:text-cyan-400 uppercase tracking-widest bg-blue-50 dark:bg-gray-700/50 border-none rounded-md px-2 py-1 focus:ring-0 cursor-pointer appearance-none outline-none"
            >
              {Object.entries(metricLabelMap).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-blue-600 dark:text-cyan-400 -ml-5 pointer-events-none" />
          </div>
          {hasEnoughData && (
            <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">
              {lastValue} <span className="text-sm font-medium text-gray-500">{unit}</span>
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <button onClick={() => setShowInfo(true)} className="p-1.5 rounded-full text-gray-400 hover:text-cyan-500 bg-gray-100 dark:bg-gray-700 transition-colors shrink-0">
          <Info className="w-5 h-5" />
        </button>
          {hasEnoughData && (
            <div className={`text-xs font-bold px-2 py-1 rounded-md ${delta <= 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'}`}>
              {delta > 0 ? '+' : ''}{delta.toFixed(1)}{unit}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 w-full min-h-0 flex items-center justify-center">
        {!hasEnoughData ? (
           <p className="text-gray-400 text-sm font-medium border border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center">{t('no_measurements')}</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" strokeOpacity={0.2} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                minTickGap={20}
              />
              <YAxis
                domain={['dataMin - 2', 'dataMax + 2']}
                tick={{ fontSize: 9, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => `${val}`}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: 'none',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  backgroundColor: '#1f2937',
                  color: '#fff'
                }}
                itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                labelStyle={{ color: '#9ca3af', fontSize: '10px', marginBottom: '4px' }}
                formatter={(value: number) => [`${value} ${unit}`, metricLabelMap[selectedMetric]]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorWeight)"
              />
            </AreaChart>
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
              <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2"><Info className="w-5 h-5 text-cyan-500" /> {t('info_weight_title')}</h3>
              <button onClick={() => setShowInfo(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400 dark:hover:text-white" /></button>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300 space-y-3">
              <p>{t('info_weight_desc')}</p>
              <p>{t('info_weight_desc2')}</p>
              <p>{t('info_weight_end')}</p>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      , document.body)}
    </div>
  );
};

// --- QUICK PR TEST MODAL ---
const QuickPRTestModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (exerciseId: string, weight: number, rpe: number, note?: string) => Promise<void>;
  exercises: Record<string, Exercise>;
}> = ({ isOpen, onClose, onSave, exercises }) => {
  const { t } = useTranslation();
  const [selectedEx, setSelectedEx] = useState<string>('');
  const [weight, setWeight] = useState<string>('');
  const [rpe, setRpe] = useState<number>(10);
  const [note, setNote] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!selectedEx || !weight || isNaN(Number(weight))) return;
    setIsSaving(true);
    try {
      await onSave(selectedEx, Number(weight), rpe, note);
      onClose();
    } catch(e) {
      console.error(e);
      alert(t('error'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/80 dark:backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', duration: 0.4 }} className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-transparent dark:border-gray-700">
        <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-700 pb-3">
          <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2"><Trophy className="w-5 h-5 text-yellow-500" /> {t('pr_test_title')}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">{t('select_exercise')}</label>
            <select value={selectedEx} onChange={e => setSelectedEx(e.target.value)} className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-cyan-500 transition-all outline-none">
              <option value="">{t('select_exercise')}...</option>
              {Object.values(exercises).sort((a,b) => a.name.localeCompare(b.name)).map(ex => (
                <option key={ex.id} value={ex.id}>{ex.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">{t('pr_test_real_weight')}</label>
              <div className="relative">
                 <input type="number" min="0" step="any" value={weight} onChange={e => setWeight(e.target.value)} placeholder="0" className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white font-bold text-lg focus:ring-2 focus:ring-cyan-500 pr-10 transition-all outline-none" />
                 <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">{t('kg')}</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">{t('rpe_effort')}</label>
              <div className="relative">
                 <input type="number" min="1" max="10" step="0.5" value={rpe} onChange={e => setRpe(Number(e.target.value))} className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white font-bold text-lg focus:ring-2 focus:ring-cyan-500 pr-10 transition-all outline-none" />
                 <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">/10</span>
              </div>
            </div>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-100 dark:border-yellow-900/50">
            <p className="text-xs text-yellow-700 dark:text-yellow-500 font-medium leading-relaxed">
              <span dangerouslySetInnerHTML={{ __html: t('pr_test_desc') }} />
            </p>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">{t('note')}</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder={t('add_note')} className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 transition-all outline-none" />
          </div>
          <Button fullWidth onClick={handleSave} disabled={isSaving || !selectedEx || !weight || Number(weight) <= 0}>
            {isSaving ? t('saving') : t('pr_test_save')}
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export const ClientHome: React.FC<Props> = ({ user, onUpdateUser }) => {
  const [inviteCode, setInviteCode] = useState('');
  const [activePlan, setActivePlan] = useState<Workout | null>(null);
  const [allLogs, setAllLogs] = useState<Log[]>([]);
  const [planSummary, setPlanSummary] = useState<ClientPlanSummary | null>(null);
  const { t } = useTranslation();

  // Quick PR Test State
  const [showPRModal, setShowPRModal] = useState(false);

  const handleSavePRTest = async (exerciseId: string, weight: number, rpe: number, note?: string) => {
    try {
      const now = new Date();
      const newLog: Omit<Log, 'id'> = {
        exerciseId,
        date: toLocalISOString(now),
        weight,
        reps: 1,
        rpe,
        completed: true,
        workoutId: 'pr_test',
        bodyweightAtLog: user.weight,
        note,
        seriesNo: 1
      };
      
      // Save log
      await LogsRepository.addLog(user.uid, newLog);
      
      // Upsert Personal Record with confidence
      const { PersonalRecordsRepository } = await import('../../repositories');
      const prResult = {
        value: weight,
        date: newLog.date,
        confidenceScore: 1.0,
        isStale: false
      };
      await PersonalRecordsRepository.upsertPR(user.uid, exerciseId, prResult);
      
      // Refresh UI data
      const freshLogs = await LogsRepository.getAllLogsForClient(user.uid, true);
      setAllLogs(freshLogs);
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  // Navigation State
  const [view, setView] = useState<'home' | 'days' | 'workout' | 'history' | 'measurements'>('home');
  const [selectedDay, setSelectedDay] = useState<number>(0);
  const [restoredWorkoutSession, setRestoredWorkoutSession] = useState<ActiveSessionState | null>(null);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [todaySessions, setTodaySessions] = useState<WorkoutSession[]>([]);
  const [selectedSessionSummary, setSelectedSessionSummary] = useState<WorkoutSession | undefined>(undefined);
  const [sessionPrompt, setSessionPrompt] = useState<{ dayIndex: number, pastSession: WorkoutSession } | null>(null);

  // Data for Day Selection
  const [planItems, setPlanItems] = useState<WorkoutItem[]>([]);
  const [exercises, setExercises] = useState<Record<string, Exercise>>({});

  // History State
  const [historyPlans, setHistoryPlans] = useState<Workout[]>([]);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [selectedSessionDate, setSelectedSessionDate] = useState<string | null>(null);
  const [sessionLogs, setSessionLogs] = useState<Log[]>([]);
  const [allSessions, setAllSessions] = useState<WorkoutSession[]>([]);

  // Measurements State
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [showAddMeas, setShowAddMeas] = useState(false);
  const [newMeas, setNewMeas] = useState<Partial<BodyMeasurement>>({});

  // Archive status: 'idle' | 'running' | 'done'
  const [archiveStatus, setArchiveStatus] = useState<ArchiveStatus>('idle');

  useEffect(() => {
    const fetchBaseData = async () => {
      // Check for active session in IndexedDB
      try {
        const savedSession = await getActiveSession(user.uid);
        if (savedSession) {
          setRestoredWorkoutSession(savedSession);
          setShowRestorePrompt(true);
        }
      } catch (err) {
        console.error('[ClientHome] Error checking active session:', err);
      }

      // 1. Fetch logs (fullHistory=true per storico completo ai grafici) e sessioni in parallelo
      const [logs, sessions] = await Promise.all([
        LogsRepository.getAllLogsForClient(user.uid, true),
        SessionsRepository.getAllSessionsForClient(user.uid)
      ]);
      setAllLogs(logs);
      setAllSessions(sessions);

      // 2. Fetch summary usando dati pre-caricati per risparmiare quota
      const summary = await UsersRepository.getClientPlanSummary(user.uid, logs, sessions);
      setPlanSummary(summary);

      if (user.ptAssigned) {
        const plan = await WorkoutsRepository.getActivePlan(user.uid);
        if (plan) {
          const [items, exs, todaySess] = await Promise.all([
            WorkoutsRepository.getPlanItems(plan.id),
            UsersRepository.getExercises(user.ptAssigned!),
            SessionsRepository.getTodaySessions(user.uid, plan.id)
          ]);
          setPlanItems(items);
          const exMap: Record<string, Exercise> = {};
          exs.forEach(e => exMap[e.id] = e);
          setExercises(exMap);
          setTodaySessions(todaySess);
        }
        setActivePlan(await WorkoutsRepository.getActivePlan(user.uid));
      }

      // 3. Archiviazione log storici
      if (!user.firstArchiveDone) {
        // Prima volta: banner visibile, operazione sincrona
        setArchiveStatus('running');
        try {
          const result = await LogsRepository.archiveOldLogs(user.uid);
          if (result.archivedMonths > 0) {
            await AuthRepository.updateProfile(user, { firstArchiveDone: true });
            onUpdateUser({ ...user, firstArchiveDone: true });
            // Ricarica logs freschi (ora includono i blob appena creati)
            const freshLogs = await LogsRepository.getAllLogsForClient(user.uid, true);
            setAllLogs(freshLogs);
            UsersRepository.getClientPlanSummary(user.uid, freshLogs, sessions).then(setPlanSummary);
          }
          setArchiveStatus('done');
          setTimeout(() => setArchiveStatus('idle'), 4000);
        } catch (err) {
          console.warn('⚠️ Prima archiviazione fallita, riproverà al prossimo login.', err);
          setArchiveStatus('idle');
        }
      } else {
        // Login successivi: fire-and-forget silenzioso
        LogsRepository.archiveOldLogs(user.uid)
          .catch(err => console.warn('⚠️ Archive silenziosa fallita:', err));
      }
    };
    fetchBaseData();
  }, [user.uid]);

  // Force refresh logs + sessions when entering home view to sync offline/online changes
  useEffect(() => {
    if (view === 'home') {
      Promise.all([
        LogsRepository.getAllLogsForClient(user.uid, true),   // fullHistory per grafici completi
        SessionsRepository.getAllSessionsForClient(user.uid)
      ]).then(([logs, sessions]) => {
        setAllLogs(logs);
        setAllSessions(sessions);
        UsersRepository.getClientPlanSummary(user.uid, logs, sessions).then(setPlanSummary);
      });
      if (activePlan) {
        SessionsRepository.getTodaySessions(user.uid, activePlan.id).then(setTodaySessions);
      }
    }
    // Also refresh todaySessions when showing the day picker,
    // so the CheckCircle and recap navigation are always up-to-date.
    if (view === 'days' && activePlan) {
      SessionsRepository.getTodaySessions(user.uid, activePlan.id).then(setTodaySessions);
    }
  }, [view, user.uid, activePlan]);

  // Fetch History List and Plans
  useEffect(() => {
    if (view === 'history') {
      Promise.all([
        LogsRepository.getAllLogsForClient(user.uid, true),  // fullHistory: serve la cronologia completa
        WorkoutsRepository.getWorkoutsForClient(user.uid),
        SessionsRepository.getAllSessionsForClient(user.uid)
      ]).then(([logs, workouts, sessions]) => {
        setAllLogs(logs);
        setHistoryPlans(workouts);
        setAllSessions(sessions);

        // Auto-expand active plan if exists
        const active = workouts.find(w => w.status === 'ACTIVE');
        if (active) setExpandedPlanId(active.id);

        if (user.ptAssigned) {
          UsersRepository.getExercises(user.ptAssigned).then(exs => {
            const exMap: Record<string, Exercise> = {};
            exs.forEach(e => exMap[e.id] = e);
            setExercises(exMap);
          });
        }
      });
    }
  }, [view, user.uid, user.ptAssigned]);

  // Fetch Measurements
  useEffect(() => {
    if (view === 'measurements') {
      UsersRepository.getMeasurements(user.uid).then(setMeasurements);
    }
  }, [view, user.uid]);

  // Compute Grouped History (Plan -> Session)
  const groupedHistory = useMemo(() => {
    if (view !== 'history') return [];

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

    // 1. Aggiungi tutte le sessioni ufficiali (che hanno i totali corretti calcolati dal Recap)
    allSessions.forEach(session => {
      const plan = historyPlans.find(p => p.id === session.workoutId);
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
        logs: [], // Populated below
        totalVolume: session.volume,
        totalSets: session.sets,
        fromSessionSummary: true
      };
    });

    // 2. Itera sui log per:
    //    - Popolare l'array `logs` delle sessioni ufficiali.
    //    - Creare sessioni legacy retroattive basate sulla somma, se non esiste la Sessione Ufficiale.
    allLogs.forEach(log => {
      const plan = historyPlans.find(p => p.id === log.workoutId);
      const planId = log.workoutId === 'pr_test' ? 'pr_test' : (plan?.id || 'unknown_plan');
      const planName = log.workoutId === 'pr_test' ? `🏆 ${t('pr_test_button')}` : (plan?.name || t('unknown'));
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
      
      // BUG 7 FIX: Escludiamo i log skip a monte. Non li spingiamo nell'array `logs` 
      // della sessione, così non inquinano né il conteggio né future letture.
      if (log.completed !== false) {
        sessionEntry.logs.push(log);
      }

      // Aggiungi ai totali *SOLO SE* è una sessione legacy senza Summary Ufficiale!
      if (!sessionEntry.fromSessionSummary) {
        // Ignora serie temp, serie saltate (completed=false) o serie senza volume reale
        if (log.id?.startsWith('temp_') || log.completed === false) return;
        sessionEntry.totalVolume += (log.weight * log.reps);
        sessionEntry.totalSets += 1;
      }
    });

    // FIX Bug 2: Ricalcola totalSets e totalVolume per le sessioni ufficiali
    // dai log reali associati, ignorando i valori salvati in Firestore che
    // potrebbero essere stati corrotti dal bug del double-counting (peso che si sommava).
    // Se una sessione ha log associati, usa quelli. Altrimenti mantieni il summary (sessioni vecchie senza log).
    Object.values(planGroups).forEach(group => {
      Object.values(group.sessions).forEach(session => {
        if (session.fromSessionSummary && session.logs.length > 0) {
          const validLogs = session.logs.filter(l => l.completed !== false && !l.id?.startsWith('temp_'));
          session.totalSets = validLogs.length;
          session.totalVolume = validLogs.reduce((acc, l) => acc + (l.weight * l.reps), 0);
        }
      });
    });

    return Object.values(planGroups).sort((a, b) => {
      if (a.isUnknown && !b.isUnknown) return 1;
      if (!a.isUnknown && b.isUnknown) return -1;
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
    }).map(group => ({
      ...group,
      sessions: Object.values(group.sessions).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    }));
  }, [allLogs, historyPlans, allSessions, view]);


  const handleSessionClick = (date: string) => {
    setSelectedSessionDate(date);
    // BUG 7 FIX: I log skip non devono apparire nel dettaglio della history
    const dayLogs = allLogs.filter(l => getLocalDatePart(l.date) === date && l.completed !== false);
    setSessionLogs(dayLogs);
  };

  const handleSaveMeasurement = async () => {
    const weightVal = Number(newMeas.weight) || 0;

    // 1. Save Measurement
    await UsersRepository.addMeasurement({
      userId: user.uid,
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

    // 2. Sync weight with Profile if weight was provided
    if (weightVal > 0) {
      try {
        await AuthRepository.updateProfile(user, { weight: weightVal });
        // Update local user state instantly
        onUpdateUser({ ...user, weight: weightVal });
      } catch (e) {
        console.error("Failed to sync profile weight", e);
      }
    }

    setShowAddMeas(false);
    setNewMeas({});
    UsersRepository.getMeasurements(user.uid).then(setMeasurements);
  };

  const handleJoin = async () => {
    if (!inviteCode) return;
    try {
      const updatedUser = await UsersRepository.linkClientToPT(user.uid, inviteCode);
      onUpdateUser(updatedUser);
    } catch (e: any) {
      alert(e.message || "Failed to join");
    }
  };

  // Full data refresh after exiting the workout logger (new sets or edits must reflect in all charts)
  const handleWorkoutExit = async () => {
    setView('days');
    setRestoredWorkoutSession(null);
    const [newLogs, newSessions] = await Promise.all([
      LogsRepository.getAllLogsForClient(user.uid, false), // fullHistory=false: basta hot data per il refresh post-sessione
      SessionsRepository.getAllSessionsForClient(user.uid),
    ]);
    setAllLogs(newLogs);
    setAllSessions(newSessions);
    UsersRepository.getClientPlanSummary(user.uid, newLogs, newSessions).then(setPlanSummary);
    if (activePlan) {
      SessionsRepository.getTodaySessions(user.uid, activePlan.id).then(setTodaySessions);
    }
  };

  const handleSelectDay = (dayIndex: number) => {
    // 1. Check if done TODAY (real-time source: fetched from Firestore at startup/exit)
    const todaySummary = todaySessions.find(s => s.dayIndex === dayIndex);
    if (todaySummary) {
      setSelectedDay(dayIndex);
      setSelectedSessionSummary(todaySummary);
      setView('workout');
      return;
    }

    if (!activePlan) return;

    // 1b. BUG 3 FIX — OFFLINE FALLBACK:
    // todaySessions è vuoto quando offline e la sessione è stata appena scritta
    // nella coda di Firebase ma non è ancora disponibile nella local cache di Firestore.
    // In quel caso allSessions (caricato all'avvio) può già avere la sessione salvata
    // in una precedente connessione → usiamolo come safety net per non aprire il
    // workout come "nuova sessione" e sommare i dati.
    const todayStr = getLocalTodayString();
    const offlineTodaySummary = allSessions.find(s =>
      s.workoutId === activePlan.id &&
      s.dayIndex === dayIndex &&
      getLocalDatePart(s.date) === todayStr
    );
    if (offlineTodaySummary) {
      setSelectedDay(dayIndex);
      setSelectedSessionSummary(offlineTodaySummary);
      setView('workout');
      return;
    }

    // 2. Check if completed THIS WEEK (excluding today)
    const now = new Date();
    const thisWeekMondayTime = getWeekStart(now).getTime();
    const todayTime = new Date(getLocalTodayString()).getTime();

    const pastSession = allSessions.find(s => {
      if (s.workoutId === activePlan.id && s.dayIndex === dayIndex) {
        const sessionTime = new Date(s.date).getTime();
        return sessionTime >= thisWeekMondayTime && sessionTime < todayTime;
      }
      return false;
    });

    if (pastSession) {
      setSessionPrompt({ dayIndex, pastSession });
      return;
    }

    // 3. Not done this week. Start new session.
    setSelectedDay(dayIndex);
    setSelectedSessionSummary(undefined);
    setView('workout');
  };

  // --- VIEW: JOIN PT ---
  if (!user.ptAssigned) {
    return (
      <div className="p-6 h-full flex flex-col justify-center bg-gray-50 dark:bg-gray-900 overflow-y-auto transition-colors">
        <ArchiveBanner status={archiveStatus} />
        <div className="glass-card p-6 rounded-3xl text-center transition-colors">
          <Lock className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('join_trainer')}</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">{t('enter_code')}</p>

          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            className="w-full text-center text-2xl font-mono tracking-widest p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl mb-4 focus:ring-2 focus:ring-cyan-500 focus:outline-none uppercase text-gray-900 dark:text-white transition-colors"
            placeholder="CODE"
          />
          <Button fullWidth onClick={handleJoin} disabled={!inviteCode} className="bg-cyan-500 text-gray-900 font-bold">{t('link_account')}</Button>
        </div>

      </div>
    );
  }

  // --- VIEW: WORKOUT LOGGER ---
  if (view === 'workout' && activePlan) {
    return (
      <WorkoutLogger
        user={user}
        workout={activePlan}
        dayIndex={selectedDay}
        initialSummary={selectedSessionSummary}
        onExit={handleWorkoutExit}
        restoredState={restoredWorkoutSession || undefined}
      />
    );
  }

  // --- VIEW: DAY SELECTOR ---
  if (view === 'days' && activePlan) {
    if (planItems.length === 0) {
      return <DashboardSkeleton />;
    }

    // Calcola i DayIndex completati "Questa Settimana" per i checkmark
    const completedThisWeekDayIndices = new Set<number>();
    const thisWeekMondayTime = getWeekStart(new Date()).getTime();

    allSessions.forEach(s => {
      if (s.workoutId === activePlan.id) {
        const sessionTime = new Date(s.date).getTime();
        if (sessionTime >= thisWeekMondayTime && s.dayIndex !== undefined) {
          completedThisWeekDayIndices.add(s.dayIndex);
        }
      }
    });

    const days = Array.from(new Set(planItems.map(i => i.dayIndex))).sort((a, b) => (a as number) - (b as number)) as number[];

    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors"
      >
        <div className="glass-panel p-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 transition-colors sticky top-0 z-10">
          <button onClick={() => setView('home')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors relative z-20">
            <ChevronLeft className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          </button>
          <h1 className="text-xl font-bold">{t('select_session')}</h1>
        </div>


        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-100 dark:border-cyan-500/30 p-4 rounded-xl">
            <p className="text-xs font-bold text-cyan-600 dark:text-cyan-400 uppercase mb-1">{t('current_plan')}</p>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{activePlan.name}</h2>
          </div>
          <p className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide ml-1">{t('available_days')}</p>
          <div className="space-y-3">
            {days.map(dayIdx => {
              const dayItems = planItems.filter(i => i.dayIndex === dayIdx);
              const muscleGroups = [...new Set(dayItems.map(i => exercises[i.exerciseId]?.groupId || 'Mixed'))] as string[];
              const isCompleted = completedThisWeekDayIndices.has(dayIdx);
              return (
                <button
                  key={dayIdx}
                  onClick={() => handleSelectDay(dayIdx)}
                  className={`w-full ${isCompleted ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'} p-5 rounded-2xl border shadow-sm hover:shadow-lg dark:hover:shadow-[0_0_15px_rgba(6,182,212,0.15)] transition-all text-left group`}
                >
                  <div className="flex justify-between items-center mb-3">
                    <span className={`${isCompleted ? 'bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-100' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-white'} text-xs font-bold px-3 py-1 rounded-full`}>
                      {t('day')} {(dayIdx as number) + 1}
                      {isCompleted && ' ✓'}
                    </span>
                    {isCompleted ? (
                      <CheckCircle className="w-10 h-10 text-green-500 transition-colors" />
                    ) : (
                      <Play className="w-10 h-10 text-gray-300 dark:text-gray-600 fill-current group-hover:text-cyan-500 dark:group-hover:text-cyan-400 transition-colors" />
                    )}
                  </div>
                  <h3 className={`font-bold text-xl capitalize mb-1 ${isCompleted ? 'text-green-900 dark:text-green-100' : 'text-gray-900 dark:text-white'}`}>
                    {muscleGroups.slice(0, 2).map(g => t('group_' + g.toLowerCase().replace(' ', '_'))).join(' & ')} {muscleGroups.length > 2 ? '+' : ''}
                  </h3>
                  <p className={`text-sm ${isCompleted ? 'text-green-700 dark:text-green-300' : 'text-gray-500 dark:text-gray-400'}`}>
                    {dayItems.length} {t('exercises')} • {t('approx')} {dayItems.length * 4} {t('mins')}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {sessionPrompt && (
          <div className="fixed inset-0 bg-black/50 dark:bg-black/80 dark:backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', duration: 0.4 }} className="glass-panel w-full max-w-sm rounded-3xl p-6 shadow-2xl"
            >
              <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">{t('session_already_completed')}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                {t('session_completed_on')} <span className="font-bold">{new Date(sessionPrompt.pastSession.date).toLocaleDateString()}</span>. {t('what_do_you_want_to_do')}
              </p>
              
              <div className="space-y-3">
                <Button 
                  fullWidth 
                  onClick={() => {
                    setSelectedDay(sessionPrompt.dayIndex);
                    setSelectedSessionSummary(sessionPrompt.pastSession);
                    setView('workout');
                    setSessionPrompt(null);
                  }}
                  className="bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-white whitespace-normal text-xs"
                >
                  <List className="w-4 h-4 mr-2 inline" />
                  {t('view_stats_recap')}
                </Button>
                
                <Button 
                  fullWidth 
                  onClick={() => {
                    setSelectedDay(sessionPrompt.dayIndex);
                    setSelectedSessionSummary(undefined);
                    setView('workout');
                    setSessionPrompt(null);
                  }}
                  className="bg-cyan-500 text-gray-900 whitespace-normal text-xs"
                >
                  <RotateCcw className="w-4 h-4 mr-2 inline" />
                  {t('repeat_workout_today')}
                </Button>
                
                <button 
                  onClick={() => setSessionPrompt(null)} 
                  className="w-full py-3 text-sm font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                >
                  {t('cancel')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </motion.div>
    );
  }

  // --- VIEW: HISTORY ---
  if (view === 'history') {
    if (selectedSessionDate) {
      const groupedSessionLogs = sessionLogs.reduce<Record<string, Log[]>>((acc, log) => {
        if (!acc[log.exerciseId]) {
          acc[log.exerciseId] = [];
        }
        acc[log.exerciseId].push(log);
        return acc;
      }, {});

      return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors">
          <div className="glass-panel p-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 transition-colors sticky top-0 z-10">
            <button onClick={() => setSelectedSessionDate(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full relative z-20">
              <ChevronLeft className="w-6 h-6 text-gray-600 dark:text-gray-400" />
            </button>
            <div>
              <h1 className="text-xl font-bold">{new Date(selectedSessionDate).toLocaleDateString()}</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">{sessionLogs.filter(l => l.completed !== false).length} {t('sets_completed')}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {(Object.entries(groupedSessionLogs) as [string, Log[]][]).map(([exId, logs]) => {
              const ex = exercises[exId];
              const isTime = ex?.measurement === 'time';
              // Filtra le serie saltate (completed=false) dalla visualizzazione del dettaglio
              const completedLogs = logs.filter(l => l.completed !== false);
              if (completedLogs.length === 0) return null; // Nasconde gli esercizi con solo serie saltate
              return (
                <div key={exId} className="glass-card p-4 rounded-xl transition-colors">
                  <h3 className="font-bold text-lg mb-3 text-gray-900 dark:text-white">{ex?.name || 'Unknown Exercise'}</h3>
                  <div className="space-y-2">
                    {completedLogs.sort((a, b) => a.seriesNo - b.seriesNo).map((log, i) => (
                      <div key={i} className="flex flex-col p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg gap-2 transition-colors">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-cyan-900/30 text-blue-600 dark:text-cyan-400 text-xs font-bold flex items-center justify-center">
                              {log.seriesNo}
                            </span>
                            <span className="font-mono font-bold text-gray-700 dark:text-gray-200">
                              {log.weight}kg <span className="text-gray-400 text-xs">x</span> {log.reps}{isTime ? 's' : ''}
                            </span>
                          </div>
                        </div>
                        {log.note && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800/50 p-2 rounded border border-gray-100 dark:border-gray-600 flex gap-2 items-start">
                            <MessageSquare className="w-3 h-3 mt-0.5 shrink-0 opacity-50" />
                            <span className="leading-tight">{log.note}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors">
        <div className="glass-panel p-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 transition-colors sticky top-0 z-10">
          <button onClick={() => setView('home')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full relative z-20">
            <ChevronLeft className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          </button>
          <h1 className="text-xl font-bold">{t('workout_history')}</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {groupedHistory.length === 0 ? (
            <div className="text-center py-10 text-gray-400">{t('no_history')}</div>
          ) : (
            groupedHistory.map(group => {
              const isActive = group.planId === expandedPlanId;
              const isCurrentActivePlan = activePlan?.id === group.planId;

              return (
                <div key={group.planId} className="glass-card rounded-xl overflow-hidden transition-all">
                  {/* Plan Header */}
                  <button
                    onClick={() => setExpandedPlanId(isActive ? null : group.planId)}
                    className={`w-full p-4 flex items-center justify-between text-left transition-colors ${isActive ? 'bg-gray-50 dark:bg-gray-700/50' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 dark:text-white text-base">{group.planName}</span>
                        {isCurrentActivePlan && (
                          <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border border-green-200 dark:border-green-800">{t('active')}</span>
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
                          onClick={() => handleSessionClick(getLocalDatePart(session.date))}
                          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group text-left pl-6"
                        >
                          <div>
                            <p className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 text-sm">
                              <Calendar className="w-3.5 h-3.5 text-blue-500 dark:text-cyan-400" />
                              {formatShortWeekdayMonthDay(session.date)}
                            </p>
                            <p className="text-xs text-gray-400 mt-1 pl-5.5">
                              {session.totalSets} {t('sets').toLowerCase()} • {(session.totalVolume / 1000).toFixed(1)}k {t('volume').toLowerCase()}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 dark:group-hover:text-cyan-400" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // --- VIEW: MEASUREMENTS ---
  if (view === 'measurements') {
    return (
      <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors">
        <div className="glass-panel p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between transition-colors sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <button onClick={() => setView('home')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full relative z-20">
              <ChevronLeft className="w-6 h-6 text-gray-600 dark:text-gray-400" />
            </button>
            <h1 className="text-xl font-bold">{t('measurements')}</h1>
          </div>
          <button onClick={() => setShowAddMeas(true)} className="p-2 bg-gray-100 dark:bg-gray-700 text-cyan-600 dark:text-cyan-400 rounded-full border border-gray-200 dark:border-gray-600">
            <Plus className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <MeasurementsTrendChart measurements={measurements} />
          {measurements.length === 0 ? (
            <div className="text-center py-10 text-gray-500">{t('no_measurements')}</div>
          ) : (
            measurements.map(m => (
              <div key={m.id} className="glass-card p-4 rounded-xl transition-colors">
                <p className="text-xs font-bold text-gray-400 mb-2 border-b border-gray-100 dark:border-gray-700 pb-2">{formatToLocaleDate(m.date)}</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <div className="flex justify-between"><span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase">{t('meas_weight')}</span><span className="font-bold text-sm text-gray-900 dark:text-white">{m.weight} kg</span></div>
                  {m.neck ? <div className="flex justify-between"><span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase">{t('meas_neck')}</span><span className="font-bold text-sm text-gray-900 dark:text-white">{m.neck} cm</span></div> : null}
                  {m.shoulders ? <div className="flex justify-between"><span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase">{t('meas_shoulders')}</span><span className="font-bold text-sm text-gray-900 dark:text-white">{m.shoulders} cm</span></div> : null}
                  {m.chest ? <div className="flex justify-between"><span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase">{t('meas_chest')}</span><span className="font-bold text-sm text-gray-900 dark:text-white">{m.chest} cm</span></div> : null}
                  {m.bicep ? <div className="flex justify-between"><span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase">{t('meas_arm')}</span><span className="font-bold text-sm text-gray-900 dark:text-white">{m.bicep} cm</span></div> : null}
                  {m.forearm ? <div className="flex justify-between"><span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase">{t('meas_forearm')}</span><span className="font-bold text-sm text-gray-900 dark:text-white">{m.forearm} cm</span></div> : null}
                  {m.waist ? <div className="flex justify-between"><span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase">{t('meas_waist')}</span><span className="font-bold text-sm text-gray-900 dark:text-white">{m.waist} cm</span></div> : null}
                  {m.hips ? <div className="flex justify-between"><span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase">{t('meas_hips')}</span><span className="font-bold text-sm text-gray-900 dark:text-white">{m.hips} cm</span></div> : null}
                  {m.thigh ? <div className="flex justify-between"><span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase">{t('meas_thigh')}</span><span className="font-bold text-sm text-gray-900 dark:text-white">{m.thigh} cm</span></div> : null}
                  {m.lowerThigh ? <div className="flex justify-between"><span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase">{t('meas_lower_thigh')}</span><span className="font-bold text-sm text-gray-900 dark:text-white">{m.lowerThigh} cm</span></div> : null}
                  {m.calf ? <div className="flex justify-between"><span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase">{t('meas_calf')}</span><span className="font-bold text-sm text-gray-900 dark:text-white">{m.calf} cm</span></div> : null}
                </div>
              </div>
            ))
          )}
        </div>

        {showAddMeas && (
          <div className="absolute inset-0 bg-black/50 dark:bg-black/80 dark:backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass-panel w-full max-h-[90%] overflow-y-auto rounded-2xl p-6 shadow-2xl transition-colors animate-slide-up">
              <div className="flex justify-between mb-4 border-b border-gray-100 dark:border-gray-700 pb-2">
                <h3 className="font-bold text-lg text-gray-900 dark:text-white">{t('new_measurements')}</h3>
                <button onClick={() => setShowAddMeas(false)}><X className="w-6 h-6 text-gray-400 dark:hover:text-white" /></button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-blue-600 dark:text-cyan-400 uppercase block mb-1">{t('meas_weight')}</label>
                  <input type="number" placeholder={t('kg')} className="w-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white p-3 rounded-xl font-bold text-lg focus:outline-blue-500 dark:focus:border-cyan-500 transition-colors" onChange={e => setNewMeas({ ...newMeas, weight: parseFloat(e.target.value) })} />
                </div>

                <p className="text-xs font-bold text-gray-400 uppercase mt-2">{t('upper_body')}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{t('meas_neck')} (cm)</label><input type="number" className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-2 rounded-lg" onChange={e => setNewMeas({ ...newMeas, neck: parseFloat(e.target.value) })} /></div>
                  <div><label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{t('meas_shoulders')} (cm)</label><input type="number" className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-2 rounded-lg" onChange={e => setNewMeas({ ...newMeas, shoulders: parseFloat(e.target.value) })} /></div>
                  <div><label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{t('meas_chest')} (cm)</label><input type="number" className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-2 rounded-lg" onChange={e => setNewMeas({ ...newMeas, chest: parseFloat(e.target.value) })} /></div>
                  <div><label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{t('meas_arm')} (cm)</label><input type="number" className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-2 rounded-lg" onChange={e => setNewMeas({ ...newMeas, bicep: parseFloat(e.target.value) })} /></div>
                  <div><label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{t('meas_forearm')} (cm)</label><input type="number" className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-2 rounded-lg" onChange={e => setNewMeas({ ...newMeas, forearm: parseFloat(e.target.value) })} /></div>
                </div>

                <p className="text-xs font-bold text-gray-400 uppercase mt-2">{t('core_legs')}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{t('meas_waist')} (cm)</label><input type="number" className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-2 rounded-lg" onChange={e => setNewMeas({ ...newMeas, waist: parseFloat(e.target.value) })} /></div>
                  <div><label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{t('meas_hips')} (cm)</label><input type="number" className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-2 rounded-lg" onChange={e => setNewMeas({ ...newMeas, hips: parseFloat(e.target.value) })} /></div>
                  <div><label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{t('meas_thigh')} (cm)</label><input type="number" className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-2 rounded-lg" onChange={e => setNewMeas({ ...newMeas, thigh: parseFloat(e.target.value) })} /></div>
                  <div><label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{t('meas_lower_thigh')} (cm)</label><input type="number" className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-2 rounded-lg" onChange={e => setNewMeas({ ...newMeas, lowerThigh: parseFloat(e.target.value) })} /></div>
                  <div><label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{t('meas_calf')} (cm)</label><input type="number" className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-2 rounded-lg" onChange={e => setNewMeas({ ...newMeas, calf: parseFloat(e.target.value) })} /></div>
                </div>

                <Button fullWidth onClick={handleSaveMeasurement} className="mt-4 bg-blue-600 dark:bg-cyan-500 text-white dark:text-gray-900 dark:font-bold">{t('save_entry')}</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- VIEW: HOME DASHBOARD ---
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white overflow-y-auto transition-colors"
    >
      <ArchiveBanner status={archiveStatus} />
      <header className="glass-panel p-6 border-b border-gray-100 dark:border-gray-700 shrink-0 transition-colors flex justify-between items-start">
        <div>
          <p className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">{t('welcome_back')}</p>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">{user.name}</h1>
        </div>
        <ThemeToggle />
      </header>

      <div className="p-4 space-y-6 flex-1">
        {(!user.weight || user.weight === 0) && (
            <div className="bg-amber-900/60 border-l-4 border-amber-500 text-amber-200 p-4 rounded-r-xl shadow-lg flex items-start gap-3 animate-fade-in text-sm">
                <Info className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
                <p>{t('bodyweight_missing_banner')}</p>
            </div>
        )}

        {/* Adherence Card (Refined) */}
        <div className="bg-gray-900 dark:bg-gray-800 text-white p-5 rounded-3xl shadow-xl border border-transparent dark:border-gray-700 relative overflow-hidden transition-colors">
          <div className="absolute -top-6 -right-6 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl"></div>
          <div className="relative z-10 flex justify-between items-center">
            <div>
              <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-1">{t('plan_adherence')}</p>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400 notranslate" translate="no">
                  {planSummary ? `${planSummary.adherencePercent}%` : '--%'}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1.5 justify-end">
                <Activity className="w-4 h-4 text-cyan-400" />
                <p className="text-xl font-bold notranslate" translate="no">{planSummary ? planSummary.totalSessionsCompleted : 0}</p>
              </div>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">{t('done_this_plan')}</p>
            </div>
          </div>

          <div className="w-full bg-gray-800 dark:bg-gray-700/50 h-2 rounded-full mt-5 overflow-hidden border border-gray-700/50">
            <div
              className={`h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(34,211,238,0.3)] ${(planSummary?.adherencePercent || 0) >= 80 ? 'bg-cyan-400' :
                (planSummary?.adherencePercent || 0) >= 50 ? 'bg-yellow-400' : 'bg-red-400'
                }`}
              style={{ width: `${planSummary?.adherencePercent || 0}%` }}
            ></div>
          </div>
        </div>

        {/* Active Plan Card */}
        <div className="bg-gradient-to-br from-blue-600 to-cyan-500 dark:from-cyan-600 dark:to-cyan-800 rounded-3xl p-6 text-white shadow-xl shadow-blue-500/20 dark:shadow-cyan-500/20 relative overflow-hidden group cursor-pointer transition-transform active:scale-[0.98] border border-blue-500 dark:border-cyan-500" onClick={() => setView('days')}>
          <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-10 -mt-10 blur-xl"></div>

          <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
              <span className="bg-black/20 text-white text-[10px] font-black uppercase px-2 py-1 rounded tracking-wide backdrop-blur-sm">{t('active_plan')}</span>
              <Trophy className="w-5 h-5 text-yellow-300" />
            </div>

            {activePlan ? (
              <>
                <h3 className="text-2xl font-black mb-1">{activePlan.name}</h3>
                <p className="text-blue-100 dark:text-cyan-100 text-sm mb-6 font-medium">{t('ends')} {formatToLocaleDate(activePlan.endDate)}</p>
                <Button variant="secondary" className="bg-white text-blue-700 dark:text-cyan-800 border-none hover:bg-blue-50 w-full pointer-events-none font-bold rounded-xl shadow-sm">
                  {t('start_workout')}
                </Button>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-blue-100 dark:text-cyan-100 font-bold">{t('no_plan')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Weekly Volume Chart */}
        <div className="notranslate" translate="no">
          <WeeklyVolumeChart logs={allLogs} sessions={allSessions} exercises={exercises} user={user} />
        </div>

        {/* Weekly Adherence Chart (from PTDashboard) */}
        <AdherenceBarChart logs={allLogs} />

        {/* Consistency Heatmap */}
        <ConsistencyHeatmap logs={allLogs} sessions={allSessions} exercises={exercises} user={user} />

        {/* ACWR Workload Ratio */}
        <ACWRChart logs={allLogs} sessions={allSessions} exercises={exercises} user={user} />

        {/* SRPE Foster Workload */}
        <SRPEChart sessions={allSessions} />

        {/* Muscle Distribution Radar */}
        <MuscleGroupRadarChart logs={allLogs} exercises={exercises} />
        
        <QuickPRTestModal 
          isOpen={showPRModal} 
          onClose={() => setShowPRModal(false)} 
          onSave={handleSavePRTest} 
          exercises={exercises} 
        />

        {/* Strength Progression Line Chart 1RM */}
        <StrengthProgressionChart logs={allLogs} exercises={exercises} onOpenPRModal={() => setShowPRModal(true)} />

        {/* NSCA Strength Levels */}
        <StrengthLevelBadge logs={allLogs} exercises={exercises} user={user} />

        {/* Quick Links */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setView('history')} className="glass-card p-4 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-[0.99] transition-all aspect-square hover:scale-[1.01] hover:shadow-xl">
            <div className="bg-orange-500/10 dark:bg-orange-500/20 p-3 rounded-full">
              <History className="w-6 h-6 text-orange-500" />
            </div>
            <span className="font-bold text-sm text-gray-700 dark:text-gray-300">{t('workout_history')}</span>
          </button>

          <button onClick={() => setView('measurements')} className="glass-card p-4 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-[0.99] transition-all aspect-square hover:scale-[1.01] hover:shadow-xl">
            <div className="bg-purple-500/10 dark:bg-purple-500/20 p-3 rounded-full">
              <Ruler className="w-6 h-6 text-purple-500" />
            </div>
            <span className="font-bold text-sm text-gray-700 dark:text-gray-300">{t('measurements')}</span>
          </button>
        </div>
      </div>

      {showRestorePrompt && restoredWorkoutSession && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/85 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', duration: 0.4 }} className="glass-panel w-full max-w-sm rounded-3xl p-6 shadow-2xl"
          >
            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">
              {t('restore_session_title') || 'Ripristina allenamento?'}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
              {t('restore_session_desc') || 'Hai una sessione di allenamento in corso non salvata. Vuoi ripristinarla da dove avevi interrotto?'}
            </p>
            <div className="space-y-3">
              <Button
                fullWidth
                onClick={() => {
                  setSelectedDay(restoredWorkoutSession.dayIndex);
                  setSelectedSessionSummary(undefined);
                  setView('workout');
                  setShowRestorePrompt(false);
                }}
                className="bg-cyan-500 text-gray-900 font-bold"
              >
                {t('restore_confirm') || 'Ripristina sessione'}
              </Button>
              <Button
                fullWidth
                onClick={async () => {
                  if (confirm(t('restore_discard_confirm') || 'Questo eliminerà definitivamente la sessione in corso non salvata. Continuare?')) {
                    const { clearActiveSession } = await import('../../offline/indexedDB');
                    await clearActiveSession(user.uid);
                    setRestoredWorkoutSession(null);
                    setShowRestorePrompt(false);
                  }
                }}
                className="bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-white border-transparent"
              >
                {t('restore_discard') || 'Elimina e ricomincia'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
};
