import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLES, type Role } from '../api/types';

export default function LoginPage() {
  const { session, login } = useAuth();
  const nav = useNavigate();
  const [user, setUser] = useState('');
  const [role, setRole] = useState<Role>('inventory_manager');

  if (session) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form
        className="card w-full max-w-sm space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!user.trim()) return;
          login({ user: user.trim(), role });
          nav('/');
        }}
      >
        <div>
          <h1 className="text-xl font-bold">EV Smart Inventory Intelligence</h1>
          <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
            Demo login only. Roles are sent as headers and are not real security.
          </p>
        </div>
        <div>
          <label className="label">Username</label>
          <input className="input" value={user} onChange={(e) => setUser(e.target.value)} placeholder="e.g. asha" autoFocus />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary w-full" type="submit" disabled={!user.trim()}>
          Sign in
        </button>
      </form>
    </div>
  );
}
