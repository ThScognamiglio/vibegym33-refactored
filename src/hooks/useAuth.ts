import { useState, useEffect } from 'react';
import { User } from '../types';
import { AuthRepository } from '../repositories';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = AuthRepository.onAuthStateChanged((u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Safety timeout: if auth is still loading after 8s (e.g. after standby with
  // expired App Check token), force-unblock the UI and show the login screen.
  useEffect(() => {
    if (!loading) return;
    const timeout = setTimeout(() => {
      console.warn('⚠️ Auth timeout: forcing loading = false after 8s');
      setLoading(false);
    }, 8000);
    return () => clearTimeout(timeout);
  }, [loading]);

  const logout = async () => {
    await AuthRepository.logout();
    setUser(null);
  };

  return { user, loading, setUser, logout };
}
