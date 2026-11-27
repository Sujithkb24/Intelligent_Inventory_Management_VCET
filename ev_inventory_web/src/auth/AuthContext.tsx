import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { getSession, setSession, type Session } from './session';
import { can as canRole, type Permission } from './roles';

interface AuthValue {
  session: Session | null;
  login: (s: Session) => void;
  logout: () => void;
  can: (p: Permission) => boolean;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setS] = useState<Session | null>(() => getSession());

  const login = useCallback((s: Session) => {
    setSession(s);
    setS(s);
  }, []);
  const logout = useCallback(() => {
    setSession(null);
    setS(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ session, login, logout, can: (p) => canRole(session?.role, p) }),
    [session, login, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
