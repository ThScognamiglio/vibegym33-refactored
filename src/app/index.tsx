import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../index.css';

import { registerSW } from 'virtual:pwa-register';
import { useWorkoutStore } from '../store/workoutStore';

// Register Service Worker for PWA (Offline Support)
const updateSW = registerSW({
  onNeedRefresh() {
    if (useWorkoutStore.getState().isWorkoutActive) {
      console.log('[PWA] Update available, but delayed because workout is active.');
      // Update will apply on next restart
    } else {
      console.log('[PWA] New content available. Updating SW...');
      // In a real app we might prompt the user, here we can auto-update if not in a workout
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('[PWA] App is ready to work offline.');
  },
});
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);