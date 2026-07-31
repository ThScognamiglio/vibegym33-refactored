import React, { useEffect, useState, useRef } from 'react';
import { Timer as TimerIcon, SkipForward, Plus, Minus, Volume2, VolumeX, Square, Pause, Play as PlayIcon } from 'lucide-react';
import { useWorkoutStore } from '../../store/workoutStore';

// Request notification permission once per session
const requestNotificationPermission = () => {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission();
  }
};

// Show a system notification via Service Worker (visible on locked screen)
const showTimerNotification = () => {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then(sw => {
        sw.showNotification('⏱ Timer scaduto! — Vibe Gym', {
          body: 'Pronto per la prossima serie? 💪',
          icon: '/icon-192x192.png',
          badge: '/icon-192x192.png',
          tag: 'rest-timer',
          requireInteraction: false,
          silent: false,
        } as NotificationOptions);
      })
      .catch(() => {
        // Fallback: plain Notification API if SW not available
        new Notification('⏱ Timer scaduto! — Vibe Gym', {
          body: 'Pronto per la prossima serie? 💪',
          icon: '/icon-192x192.png',
        });
      });
  }
};

export const Timer: React.FC = () => {
  const { timerEndTime, totalTimerDuration, isTimerPaused, pausedRemainingMs, stopTimer, adjustTimer, pauseTimer, resumeTimer } = useWorkoutStore();
  const [seconds, setSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(isMuted);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        if (Ctx) {
            audioCtxRef.current = new Ctx();
        }
    } catch (e) {
        console.error("Audio init error", e);
    }
    
    return () => {
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
            audioCtxRef.current.close();
        }
    };
  }, []);

  const playAlarm = async () => {
    if (isMutedRef.current) return;

    try {
      let ctx = audioCtxRef.current;
      
      if (!ctx || ctx.state === 'closed') {
          const Ctx = window.AudioContext || (window as any).webkitAudioContext;
          if (Ctx) {
              ctx = new Ctx();
              audioCtxRef.current = ctx;
          } else {
              return;
          }
      }

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const now = ctx.currentTime;
      const durationSeconds = 10;
      
      for (let i = 0; i < durationSeconds; i++) {
         const t = now + i;
         
         const osc = ctx.createOscillator();
         const gain = ctx.createGain();
         osc.connect(gain);
         gain.connect(ctx.destination);
         
         osc.type = 'triangle'; 
         
         osc.frequency.setValueAtTime(880, t);
         osc.frequency.setValueAtTime(880, t + 0.1);
         osc.frequency.exponentialRampToValueAtTime(554.37, t + 0.15);
         
         gain.gain.setValueAtTime(0.001, t);
         gain.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
         gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
         
         osc.start(t);
         osc.stop(t + 0.6);
      }
      
      if (navigator.vibrate) {
        const pattern = Array(durationSeconds).fill(0).flatMap(() => [200, 800]);
        navigator.vibrate(pattern);
      }
    } catch (e) {
      console.error("Audio play failed", e);
    }
  };

  const alarmPlayedRef = useRef(false);

  useEffect(() => {
    if (!timerEndTime && pausedRemainingMs === null) return;

    const calcRemaining = () => {
        if (isTimerPaused && pausedRemainingMs !== null) return Math.max(0, Math.round(pausedRemainingMs / 1000));
        return Math.max(0, Math.round((timerEndTime! - Date.now()) / 1000));
    };

    const rem = calcRemaining();
    setSeconds(rem);

    if (rem <= 0 && !alarmPlayedRef.current && !isTimerPaused) {
        alarmPlayedRef.current = true;
        playAlarm();
        showTimerNotification();
        // Auto-close after 10s of alarm
        const timeout = setTimeout(() => {
            stopTimer();
        }, 10000);
        return () => clearTimeout(timeout);
    }

    if (rem > 0) {
        alarmPlayedRef.current = false; // Reset if time was added
    }

    if (isTimerPaused) return;

    const interval = setInterval(() => {
      const remaining = calcRemaining();
      setSeconds(remaining);
    }, 500);

    return () => clearInterval(interval);
  }, [timerEndTime, isTimerPaused, pausedRemainingMs]);

  if (!timerEndTime && pausedRemainingMs === null) return null;

  const progress = Math.min(100, Math.max(0, ((totalTimerDuration - seconds) / totalTimerDuration) * 100));

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handlePauseResume = () => {
    if (isTimerPaused) {
        resumeTimer();
    } else {
        pauseTimer();
    }
  };


  // When timer hits 0, we still render the component for 10s to allow "Stop" action
  // We change the visual state to indicate "Time's Up"
  const isFinished = seconds <= 0;

  return (
    <div className={`fixed bottom-24 left-4 right-4 backdrop-blur-xl border text-white rounded-2xl shadow-2xl z-[9999] overflow-hidden transform transition-all animate-slide-up ${isFinished ? 'bg-red-900/95 border-red-500' : 'bg-gray-800/95 border-gray-700'}`}>
      <div className="p-4 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl border shadow-inner relative ${isFinished ? 'bg-red-800/50 border-red-400' : 'bg-gray-700/50 border-gray-600'}`}>
            <TimerIcon className={`w-6 h-6 ${isFinished ? 'text-white animate-bounce' : 'text-cyan-400 animate-pulse'}`} />
            {!isFinished && <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full animate-ping"></div>}
          </div>
          <div>
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${isFinished ? 'text-red-200' : 'text-gray-400'}`}>
                {isFinished ? "Time's Up!" : "Resting"}
            </p>
            <p className="text-3xl font-black font-mono tracking-tight text-white leading-none tabular-nums">
              {formatTime(seconds)}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
             <button 
                onClick={() => setIsMuted(!isMuted)}
                className={`p-2 rounded-full transition-colors ${isFinished ? 'bg-red-800/50 text-red-200 hover:bg-red-700' : 'bg-gray-700/50 text-gray-400 hover:bg-gray-600 hover:text-white'}`}
             >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className={`w-4 h-4 ${isFinished ? 'text-white' : 'text-cyan-400'}`} />}
             </button>

            {!isFinished && (
                <div className="flex flex-col gap-1 mr-2 border-l border-gray-700 pl-3">
                    <button 
                        onClick={() => adjustTimer(10)}
                        className="p-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
                    >
                        <Plus className="w-3 h-3" />
                    </button>
                    <button 
                        onClick={() => adjustTimer(-10)}
                        className="p-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
                    >
                        <Minus className="w-3 h-3" />
                    </button>
                </div>
            )}
            
            <button 
                onClick={() => stopTimer()}
                className={`group flex items-center justify-center p-3 rounded-xl border transition-all active:scale-95 ${
                    isFinished 
                    ? 'bg-white text-red-600 border-white hover:bg-gray-100 shadow-lg animate-pulse' 
                    : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border-cyan-500/30 hover:border-cyan-500/50'
                }`}
                title={isFinished ? "Stop Alarm" : "Skip Rest"}
            >
                {isFinished ? <Square className="w-6 h-6 fill-current" /> : <SkipForward className="w-6 h-6 fill-current" />}
                {isFinished && <span className="ml-2 font-bold text-sm">STOP</span>}
            </button>
        </div>
      </div>

      {/* Progress Bar Container */}
      <div className="absolute bottom-0 left-0 w-full h-1.5 bg-gray-900">
        {/* Progress Fill */}
        <div 
          className={`h-full transition-all duration-1000 ease-linear ${
              seconds < 5 && !isFinished ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)]' 
              : isFinished ? 'bg-white'
              : 'bg-gradient-to-r from-cyan-600 to-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.6)]'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};
