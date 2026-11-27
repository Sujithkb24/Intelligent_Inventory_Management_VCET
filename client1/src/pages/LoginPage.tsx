import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLES, type Role } from '../api/types';
<<<<<<< HEAD
import { BrandMark } from '../components/common/Icons';
=======
import { config } from '../config';
import { firebaseConfigured } from '../auth/firebase';
>>>>>>> ef9900dad6fc03c6e1ce13912aeaaebdc0647cf1

export default function LoginPage() {
  const { session, login, loginDemo, logout } = useAuth();
  const nav = useNavigate();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('inventory_manager');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const demo = config.authMode === 'demo';

  if (session?.role) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
      <form
<<<<<<< HEAD
        className="card w-full max-w-sm space-y-5"
        onSubmit={(e) => {
=======
        className="card w-full max-w-sm space-y-4"
        onSubmit={async (e) => {
>>>>>>> ef9900dad6fc03c6e1ce13912aeaaebdc0647cf1
          e.preventDefault();
          setError('');
          setBusy(true);
          try {
            if (demo) loginDemo({ user: user.trim(), role });
            else await login(user.trim(), password);
            nav('/');
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
          } finally {
            setBusy(false);
          }
        }}
      >
<<<<<<< HEAD
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-7 w-7" />
            <h1 className="text-lg font-bold tracking-[-0.01em] text-[var(--text-primary)]">
              EV Smart Inventory Intelligence
            </h1>
          </div>
          <p className="rounded-[8px] border border-[#F6D79D] bg-[#FFF3DC] px-3 py-2 text-xs text-[#9A5B00]">
            Demo login only. Roles are sent as headers and are not real security.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="login-username">
            Username
          </label>
          <input
            id="login-username"
            className="input"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="e.g. asha"
            autoFocus
          />
        </div>
        <div>
          <label className="label" htmlFor="login-role">
            Role
          </label>
          <select
            id="login-role"
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary w-full" type="submit" disabled={!user.trim()}>
          Sign in
=======
        <div>
          <h1 className="text-xl font-bold">EV Smart Inventory Intelligence</h1>
          {demo
            ? <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">Local demo mode only. Do not use this mode with a public backend.</p>
            : <p className="mt-1 text-xs text-slate-600">Sign in with your Firebase Authentication account. Your role is assigned by an administrator.</p>}
        </div>
        <div>
          <label className="label">{demo ? 'Username' : 'Email'}</label>
          <input className="input" type={demo ? 'text' : 'email'} value={user} onChange={(e) => setUser(e.target.value)} placeholder={demo ? 'e.g. asha' : 'name@example.com'} autoFocus required />
        </div>
        {demo ? (
          <div>
            <label className="label">Role (demo only)</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </div>
        )}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {!demo && !firebaseConfigured && <p className="text-sm text-amber-800">Firebase is not configured. Add the VITE_FIREBASE_* values to client1/.env.</p>}
        {session && !session.role && <div className="space-y-2 text-sm text-amber-800">
          <p>This account has no valid application role. Ask an administrator to assign one.</p>
          <button type="button" className="btn" onClick={() => logout().catch((reason: unknown) => setError(String(reason)))}>Sign out</button>
        </div>}
        <button className="btn btn-primary w-full" type="submit" disabled={!user.trim() || (!demo && !password) || busy || (!demo && !firebaseConfigured)}>
          {busy ? 'Signing in…' : 'Sign in'}
>>>>>>> ef9900dad6fc03c6e1ce13912aeaaebdc0647cf1
        </button>
      </form>
    </div>
  );
}
