
import React, { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// ReloadPrompt: handles Service Worker lifecycle.
// Shows a discreet banner when a new SW version is available.
// The SW registers silently on load (autoUpdate), so this banner
// is shown only on the rare case where manual refresh is needed.
export const ReloadPrompt = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('✅ Service Worker registered:', r);
    },
    onRegisterError(error) {
      console.warn('⚠️ Service Worker registration failed:', error);
    },
  });

  if (!needRefresh) return null;

  // WORKOUT LOCK: Se l'utente è dentro il WorkoutLogger, nascondi il banner
  // per prevenire che un misclick aggiorni l'app e distrugga lo stato della sessione.
  if (document.getElementById('workout-logger-container')) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[9999] bg-gray-800 border border-cyan-500/40 rounded-2xl px-4 py-3 flex items-center justify-between shadow-xl shadow-black/40">
      <div>
        <p className="text-sm font-bold text-white">Aggiornamento disponibile</p>
        <p className="text-xs text-gray-400">Ricarica per ottenere la nuova versione.</p>
      </div>
      <div className="flex gap-2 ml-4 shrink-0">
        <button
          onClick={() => setNeedRefresh(false)}
          className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded-lg transition-colors"
        >
          Ignora
        </button>
        <button
          onClick={() => updateServiceWorker(true)}
          className="text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-black px-3 py-1.5 rounded-xl transition-colors"
        >
          Aggiorna
        </button>
      </div>
    </div>
  );
};

