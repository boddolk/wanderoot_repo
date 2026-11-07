import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api, tokenStore, User } from './api';

interface AuthState {
  user: User | null;
  ready: boolean;
  login: (login: string, password: string) => Promise<void>;
  register: (data: { login: string; email: string; password: string; displayName?: string }) => Promise<void>;
  logout: () => void;
  /** Оновлює дані поточного користувача після редагування профілю. */
  setUser: (user: User) => void;
  /** Приймає нову сесію (наприклад, після зміни пароля сервер видає новий токен). */
  acceptSession: (res: { token: string; user: User }) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!tokenStore.get()) { setReady(true); return; }
    api.me().then(setUser).catch(() => tokenStore.set(null)).finally(() => setReady(true));
  }, []);

  const accept = (res: { token: string; user: User }) => { tokenStore.set(res.token); setUser(res.user); };
  const value: AuthState = {
    user, ready,
    login: async (login, password) => accept(await api.login(login, password)),
    register: async (data) => accept(await api.register(data)),
    logout: () => { tokenStore.set(null); setUser(null); },
    setUser,
    acceptSession: accept,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export const isModerator = (u: User | null) => !!u && (u.role === 'MODERATOR' || u.role === 'ADMIN');

/** Ініціали для аватара: перші літери двох слів імені. */
export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
