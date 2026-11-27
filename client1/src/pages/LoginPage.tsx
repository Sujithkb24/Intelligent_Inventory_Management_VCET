import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLES, type Role } from '../api/types';
import { BrandMark } from '../components/common/Icons';

export default function LoginPage() {
  const { session, login } = useAuth();
  const nav = useNavigate();
  const [user, setUser] = useState('');
  const [role, setRole] = useState<Role>('inventory_manager');

  if (session) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
      <form
        className="card w-full max-w-sm space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!user.trim()) return;
          login({ user: user.trim(), role });
          nav('/');
        }}
      >
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
        </button>
      </form>
    </div>
  );
}
