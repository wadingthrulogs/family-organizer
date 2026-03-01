import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { AuthUser, LoginPayload, RegisterPayload } from '../types/auth';
import * as authApi from '../api/auth';

interface AuthContextValue {
  user: AuthUser | null;
  /** true while the initial /me check is in flight */
  loading: boolean;
  login: (payload: LoginPayload) => Promise<AuthUser>;
  register: (payload: RegisterPayload) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, check if there's already a session
  useEffect(() => {
    let cancelled = false;
    authApi
      .fetchMe()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        /* not logged in */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    const u = await authApi.login(payload);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const u = await authApi.register(payload);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
