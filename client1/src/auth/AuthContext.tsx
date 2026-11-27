import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { getSession, setSession, type Session } from './session';
import { can as canRole, type Permission } from './roles';
import { firebaseAuth } from './firebase';
import { config } from '../config';
import { ROLES, type Role } from '../api/types';

interface AuthValue {
  session: Session | null;
  loading: boolean;
  loginDemo: (s: Session) => void;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (p: Permission) => boolean;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setS] = useState<Session | null>(() => (config.authMode === 'demo' ? getSession() : null));
  const [loading, setLoading] = useState(config.authMode !== 'demo');

  useEffect(() => {
    if (config.authMode === 'demo') return;
    if (!firebaseAuth) {
      setLoading(false);
      return;
    }
    return onAuthStateChanged(firebaseAuth, {
      next: (user) => {
        if (!user) {
          setS(null);
          setLoading(false);
          return;
        }
        user
          .getIdTokenResult()
          .then((token) => {
            const roleClaim = token.claims[config.firebaseRoleClaim];
            const role = ROLES.includes(roleClaim as Role) ? (roleClaim as Role) : null;
            setS({ user: user.displayName || user.email || user.uid, role });
            setLoading(false);
          })
          .catch((error: unknown) => {
            console.error('Unable to read Firebase role claim', error);
            setS(null);
            setLoading(false);
          });
      },
      error: (error: Error) => {
        console.error('Firebase authentication state could not be loaded', error);
        setLoading(false);
      },
      complete: () => setLoading(false),
    });
  }, []);

  const loginDemo = useCallback((s: Session) => {
    setSession(s);
    setS(s);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    if (!firebaseAuth) throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values.');
    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    const token = await credential.user.getIdTokenResult(true);
    const roleClaim = token.claims[config.firebaseRoleClaim];
    if (!ROLES.includes(roleClaim as Role)) {
      await signOut(firebaseAuth);
      throw new Error(`This Firebase account has no valid '${config.firebaseRoleClaim}' role claim.`);
    }
  }, []);

  const loginWithGoogle = useCallback(async () => {
    if (!firebaseAuth) throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values.');
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const credential = await signInWithPopup(firebaseAuth, provider);
    const token = await credential.user.getIdTokenResult(true);
    const roleClaim = token.claims[config.firebaseRoleClaim];
    if (!ROLES.includes(roleClaim as Role)) {
      await signOut(firebaseAuth);
      throw new Error(
        `Signed in with Google (${credential.user.email ?? 'account'}), but no valid '${config.firebaseRoleClaim}' role claim is assigned yet.`,
      );
    }
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    if (!firebaseAuth) throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values.');
    await createUserWithEmailAndPassword(firebaseAuth, email, password);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (!firebaseAuth) throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values.');
    await sendPasswordResetEmail(firebaseAuth, email);
  }, []);

  const logout = useCallback(async () => {
    if (config.authMode === 'demo') {
      setSession(null);
      setS(null);
    } else if (firebaseAuth) {
      await signOut(firebaseAuth);
      setS(null);
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      loading,
      loginDemo,
      login,
      loginWithGoogle,
      register,
      resetPassword,
      logout,
      can: (p) => canRole(session?.role ?? undefined, p),
    }),
    [session, loading, loginDemo, login, loginWithGoogle, register, resetPassword, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
