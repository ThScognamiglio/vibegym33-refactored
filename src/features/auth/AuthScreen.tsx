
import React, { useState } from 'react';
import { Role } from '../../types';

import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Dumbbell, ArrowRight, Lock, Mail, Globe, AlertTriangle } from 'lucide-react';
import { useTranslation } from '../../services/i18n';
import { ThemeToggle } from '../../components/ThemeToggle';
import { AuthRepository } from '../../repositories';

interface Props {
  onLogin: (user: any) => void;
}

export const AuthScreen: React.FC<Props> = ({ onLogin }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('client');
  const [loading, setLoading] = useState(false);
  const [isPending, setIsPending] = useState(false); // NEW: State for pending accounts
  const [authError, setAuthError] = useState<string | null>(null);
  const { t, language, setLanguage } = useTranslation();

  const handleAuth = async () => {
    setAuthError(null);
    if (!email) {
      setAuthError('Inserisci la tua email.');
      return;
    }
    if (!isResetting && !password) {
      setAuthError('Inserisci la password.');
      return;
    }
    if (isSignUp && !name) {
      setAuthError('Inserisci il tuo nome completo.');
      return;
    }

    setLoading(true);
    try {
      if (isResetting) {
        await AuthRepository.resetPassword(email);
        alert("Controlla la tua email! Ti abbiamo inviato un link per resettare la password. (Verifica anche nella cartella Spam)");
        setIsResetting(false);
        return;
      }

      let user;
      if (isSignUp) {
        user = await AuthRepository.signUp(email, password, role, name);
      } else {
        user = await AuthRepository.signIn(email, password, role, name);
      }

      // NEW: Check for active status
      // Clients are active by default (isActive true or undefined/legacy)
      // PTs might be inactive
      if (user.role === 'pt' && user.isActive === false) {
        await AuthRepository.logout(); // Pulisci la sessione utente di firebase per evitare glitch
        setIsPending(true);
        setLoading(false);
        return;
      } else {
        onLogin(user);
      }

    } catch (e: any) {
      console.error(e);
      let msg = e.message;

      // Map specific codes to user-friendly messages
      if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') {
        msg = t('auth_invalid_cred');
      } else if (e.code === 'auth/user-not-found') {
        msg = "Utente non trovato. Verifica di aver inserito l'email corretta.";
      } else if (e.code === 'auth/email-already-in-use') {
        msg = t('auth_email_in_use');
      } else if (e.code === 'auth/invalid-email') {
        msg = t('auth_invalid_email');
      } else if (e.code === 'auth/weak-password') {
        msg = t('auth_weak_password');
      } else if (e.code === 'auth/too-many-requests') {
        msg = "Troppe richieste. Riprova più tardi.";
      }

      setAuthError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (isPending) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full px-6 py-10 bg-white dark:bg-gray-900 transition-colors">
        <div className="bg-yellow-50 dark:bg-yellow-900/30 p-4 rounded-full mb-6 animate-pulse">
          <AlertTriangle className="w-10 h-10 text-yellow-600 dark:text-yellow-400" />
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-2 text-center">{t('account_pending')}</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8 text-center text-sm leading-relaxed max-w-xs">
          {t('account_pending_desc')}
        </p>
        <Button fullWidth onClick={() => setIsPending(false)}>
          {t('back_login')}
        </Button>
      </div>
    );
  }

  if (isResetting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full px-6 py-10 bg-white dark:bg-gray-900 transition-colors">
        <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-full mb-6">
          <Lock className="w-10 h-10 text-blue-600 dark:text-blue-400" />
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-2">Reset Password</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8 text-center text-sm">Enter your email and we'll send you a link to reset your password.</p>

        <div className="w-full max-w-sm space-y-4 glass-panel p-8">
          <Input
            label={t('email')}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />

          <Button className="w-full" onClick={handleAuth} disabled={loading}>
            {loading ? 'Sending...' : t('send_link')}
          </Button>

          <button
            onClick={() => setIsResetting(false)}
            className="w-full py-3 text-sm font-bold text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            {t('back_login')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full bg-white dark:bg-gray-950 transition-colors">

      {/* ===== LEFT BRAND PANEL — desktop only ===== */}
      <div className="hidden md:flex flex-col justify-between w-1/2 bg-gray-900 dark:bg-gray-950 p-12 text-white relative overflow-hidden">
        {/* Decorative glowing orbs */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-cyan-500/20 rounded-full blur-[120px]" />

        {/* Content */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="bg-white/10 backdrop-blur-md border border-white/10 p-2.5 rounded-xl">
              <Dumbbell className="w-6 h-6 text-cyan-400" />
            </div>
            <span className="text-2xl font-black tracking-tight text-white">Vibe Gym</span>
          </div>

          <h2 className="text-5xl font-black leading-tight mb-4">
            Train harder,<br /><span className="text-gradient">track smarter.</span>
          </h2>
          <p className="text-gray-400 text-lg leading-relaxed max-w-md">
            Your personal trainer & workout tracker. Log sets, track progress, and crush your goals.
          </p>
        </div>

        {/* Bottom stats teaser */}
        <div className="relative z-10 grid grid-cols-2 gap-4">
          {[['💪', 'Smart Logging', 'Track weight, reps & RPE'], ['📊', 'Analytics', 'Visualize your progress'], ['🏃', 'Superset Support', 'Advanced workout flows'], ['🔒', 'Secure', 'Firebase-backed & private']].map(([emoji, title, desc]) => (
            <div key={title} className="glass-card rounded-2xl p-4 border border-white/5">
              <div className="text-2xl mb-1">{emoji}</div>
              <p className="font-bold text-sm text-gray-100">{title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ===== RIGHT FORM PANEL ===== */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 relative overflow-y-auto bg-gray-50 dark:bg-gray-950">
        {/* Glow effect on mobile */}
        <div className="md:hidden absolute top-0 w-full h-96 bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="absolute top-6 right-6 flex items-center gap-2 z-20">
          <ThemeToggle />
          <button
            onClick={() => setLanguage(language === 'en' ? 'it' : 'en')}
            aria-label="Toggle language"
            className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-700"
          >
            <Globe className="w-3 h-3" /> {language === 'en' ? 'IT' : 'EN'}
          </button>
        </div>

        {/* Logo + title — shown on mobile only */}
        <div className="md:hidden bg-blue-600 p-4 rounded-full mb-6 shadow-xl shadow-blue-500/30">
          <Dumbbell className="w-10 h-10 text-white" />
        </div>
        <h1 className="md:hidden text-3xl font-extrabold text-gray-900 dark:text-white mb-2">Vibe Gym</h1>
        <p className="md:hidden text-gray-500 dark:text-gray-400 mb-8 text-center">{t('welcome_app')}</p>

        {/* Desktop form header */}
        <div className="hidden md:block mb-8 w-full max-w-sm">
          <h2 className="text-2xl font-black text-gray-900 dark:text-white">{isSignUp ? t('create_account') : t('login')}</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{isSignUp ? 'Create your Vibe Gym account' : 'Welcome back! Sign in to continue.'}</p>
        </div>

        <div className="w-full max-w-sm space-y-5 relative z-10">
          {/* Toggle Login/Signup */}
          <div className="flex bg-gray-200/50 dark:bg-gray-900 p-1.5 rounded-xl mb-6 shadow-inner border border-gray-100 dark:border-gray-800">
            <button
              onClick={() => { setIsSignUp(false); setAuthError(null); }}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all duration-300 ${!isSignUp ? 'bg-white dark:bg-gray-800 shadow-md text-gray-900 dark:text-white scale-[1.02]' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
            >
              {t('login')}
            </button>
            <button
              onClick={() => { setIsSignUp(true); setAuthError(null); }}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all duration-300 ${isSignUp ? 'bg-white dark:bg-gray-800 shadow-md text-gray-900 dark:text-white scale-[1.02]' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
            >
              {t('signup')}
            </button>
          </div>

          {/* Role Selection */}
          {isSignUp && (
            <div className="flex gap-4 justify-center mb-4">
              <label className={`cursor-pointer flex items-center gap-2 border-2 px-4 py-2.5 rounded-xl transition-all duration-300 ${role === 'client' ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 shadow-lg shadow-cyan-500/10' : 'border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:border-cyan-300'}`}>
                <input type="radio" name="role" checked={role === 'client'} onChange={() => setRole('client')} className="hidden" />
                <span className="font-bold text-sm">{t('role_client')}</span>
              </label>
              <label className={`cursor-pointer flex items-center gap-2 border-2 px-4 py-2.5 rounded-xl transition-all duration-300 ${role === 'pt' ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 shadow-lg shadow-cyan-500/10' : 'border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:border-cyan-300'}`}>
                <input type="radio" name="role" checked={role === 'pt'} onChange={() => setRole('pt')} className="hidden" />
                <span className="font-bold text-sm">{t('role_pt')}</span>
              </label>
            </div>
          )}

          {isSignUp && (
            <Input
              label={t('full_name')}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
            />
          )}

          <Input
            label={t('email')}
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setAuthError(null); }}
            placeholder="you@example.com"
          />

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label htmlFor="auth-password" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">{t('password')}</label>
              {!isSignUp && (
                <button
                  onClick={() => setIsResetting(true)}
                  className="text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 transition-colors"
                >
                  {t('forgot_pass')}
                </button>
              )}
            </div>
            <div className="relative">
              <Input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setAuthError(null); }}
                placeholder="••••••••"
              />
            </div>
          </div>

          {authError && (
            <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4">
              <span className="text-red-500 dark:text-red-400 text-lg leading-none mt-0.5">⚠️</span>
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">{authError}</p>
            </div>
          )}
          <Button className="w-full mt-4" onClick={handleAuth} isLoading={loading}>
            {isSignUp ? t('create_account') : t('login')} <ArrowRight className="w-4 h-4 inline ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
};
