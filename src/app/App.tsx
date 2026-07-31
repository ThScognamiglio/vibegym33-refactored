
import React, { useState, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthScreen } from '../features/auth/AuthScreen';

// Lazy loaded views for Code Splitting
const PTDashboard = lazy(() => import('../features/dashboard-pt/PTDashboard').then(m => ({ default: m.PTDashboard })));
const ClientHome = lazy(() => import('../features/dashboard-client/ClientHome').then(m => ({ default: m.ClientHome })));
const ProfileScreen = lazy(() => import('../features/profile/ProfileScreen').then(m => ({ default: m.ProfileScreen })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});
import { ReloadPrompt } from '../components/ReloadPrompt';
import { AdminPanel } from '../features/admin/AdminPanel';
import { FloatingVideoPlayer } from '../features/workout/FloatingVideoPlayer';
import { Timer } from '../features/workout/Timer';
import { Home, User as UserIcon, LogOut, Dumbbell } from 'lucide-react';
import { clsx } from 'clsx';
import { isMissingConfig } from '../services/firebase.config';
import { I18nProvider, useTranslation } from '../services/i18n';
import { ThemeProvider } from '../services/theme';
import { AlertCircle } from 'lucide-react';
import { AppLoadingSkeleton } from '../components/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { useNetwork } from '../hooks/useNetwork';
import { useAdminTrigger } from '../hooks/useAdminTrigger';

const AppContent = () => {
  const { user, loading, setUser, logout } = useAuth();
  const isOnline = useNetwork();
  const { showAdmin, setShowAdmin, triggerAdmin } = useAdminTrigger(user?.isAdmin);
  
  const navigate = useNavigate();
  const location = useLocation();

  const { t } = useTranslation();

  const handleLogout = () => {
      logout();
  };

  const handleProfileClick = () => {
      navigate('/profile');
      triggerAdmin();
  };

  if (loading) {
      return <AppLoadingSkeleton />;
  }

  const isPending = user?.role === 'pt' && user?.isActive === false;

  const navItems = [
    { id: '/' as const, label: t('tab_home'), icon: Home },
    { id: '/profile' as const, label: t('tab_profile'), icon: UserIcon },
  ];

  const isLoggedIn = !!user && !isPending;

  return (
    <div className="fixed inset-0 bg-gray-100 dark:bg-gray-950 flex flex-col md:flex-row font-sans transition-colors duration-300">
      {/* Banner per Modalità Demo se mancano variabili d'ambiente (solo in produzione/Netlify) */}
      {isMissingConfig && (
          <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-xs font-bold z-[10000] animate-pulse">
              <AlertCircle size={14} />
              <span>MODALITÀ DEMO ATTIVA: Configura VITE_FIREBASE_API_KEY su Netlify per attivare il database reale.</span>
          </div>
      )}

      {/* Offline Banner — shown only when logged in and no network */}
      {!isOnline && user && (
          <div className="bg-gray-700/95 backdrop-blur text-white px-4 py-2 flex items-center justify-center gap-2 text-xs font-semibold z-[10000]">
              <span>📶</span>
              <span>Sei offline — i tuoi dati locali sono disponibili. Le modifiche si sincronizzeranno al ritorno online.</span>
          </div>
      )}
      
      {/* Version marker for debugging */}
      <div className="fixed bottom-2 right-2 text-[10px] text-gray-400 z-[9999] opacity-30 select-none pointer-events-none">v1.0.6 - Demo Mode Support</div>

      {/* ===== DESKTOP SIDEBAR (md+, only when logged in) ===== */}
      {isLoggedIn && (
        <aside className="hidden md:flex flex-col w-60 lg:w-64 shrink-0 glass-panel border-r-0 border-white/20 dark:border-white/5 shadow-2xl z-20">
          {/* Logo */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100 dark:border-gray-800">
            <div className="bg-blue-600 dark:bg-cyan-500 p-2 rounded-xl shadow-lg shadow-blue-500/30">
              <Dumbbell className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-black text-gray-900 dark:text-white tracking-tight">Vibe Gym</span>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => id === '/profile' ? handleProfileClick() : navigate(id)}
                className={clsx(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-300',
                  location.pathname === id
                    ? 'bg-blue-600 shadow-lg shadow-blue-500/30 text-white dark:bg-cyan-500/20 dark:shadow-none dark:text-cyan-400'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-white'
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {label}
              </button>
            ))}
          </nav>

          {/* User info + Logout */}
          <div className="px-3 py-4 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3 px-3 py-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 dark:bg-cyan-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                {user?.name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{user?.name}</p>
                <p className="text-[11px] text-gray-400 truncate">{user?.role?.toUpperCase()}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 dark:hover:text-red-400 transition-all"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {t('tab_logout')}
            </button>
          </div>
        </aside>
      )}

      {/* ===== MAIN CONTENT AREA ===== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}

        {!user || isPending ? (
          <div className="flex-1 overflow-y-auto">
            {isPending ? (
              <div className="flex flex-col items-center justify-center min-h-full px-6 py-10 glass-panel">
                <h1 className="text-2xl font-bold text-yellow-600 mb-2">{t('account_pending')}</h1>
                <p className="text-center text-gray-500 mb-6">{t('account_pending_desc')}</p>
                <button onClick={handleLogout} className="text-blue-600 font-bold">Back to Login</button>
              </div>
            ) : (
              <AuthScreen onLogin={setUser} />
            )}
          </div>
        ) : (
          <>
            {/* Main Content */}
            <div className="flex-1 overflow-hidden relative flex flex-col">
              <Suspense fallback={<AppLoadingSkeleton />}>
                <Routes>
                  <Route path="/" element={
                    user.role === 'pt' ? (
                        <PTDashboard user={user} />
                    ) : (
                        <ClientHome user={user} onUpdateUser={setUser} />
                    )
                  } />
                  <Route path="/profile" element={
                    <ProfileScreen user={user} onUpdate={setUser} />
                  } />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </div>

            {/* MOBILE BOTTOM NAV — `md:hidden` keeps this only on mobile */}
            <div className="md:hidden h-16 glass-panel backdrop-blur-xl border-t border-white/10 flex justify-around items-center px-6 shrink-0 z-30 transition-colors duration-300 pb-safe">
              {navItems.map(({ id, label, icon: Icon }) => (
                <div
                  key={id}
                  onClick={() => id === '/profile' ? handleProfileClick() : navigate(id)}
                  className={clsx('flex flex-col items-center gap-1 cursor-pointer transition-colors', location.pathname === id ? 'text-blue-600 dark:text-cyan-400 drop-shadow-md' : 'text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-300')}
                >
                  <Icon className="w-6 h-6" />
                  <span className="text-[10px] font-bold">{label}</span>
                </div>
              ))}
              <div
                onClick={handleLogout}
                className="flex flex-col items-center gap-1 cursor-pointer text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400"
              >
                <LogOut className="w-6 h-6" />
                <span className="text-[10px] font-bold">{t('tab_logout')}</span>
              </div>
            </div>
          </>
        )}
        <ReloadPrompt />
        <FloatingVideoPlayer />
        <Timer />
      </div>
    </div>
  );
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
