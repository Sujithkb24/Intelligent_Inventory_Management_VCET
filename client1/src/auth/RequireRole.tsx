import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import type { Permission } from './roles';

export function RequireRole({ permission, children }: { permission?: Permission; children: ReactNode }) {
  const { session, loading, can } = useAuth();
  if (loading) return <div className="p-6 text-sm text-slate-500">Checking sign-in…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (permission && !can(permission)) {
    return (
      <div className="card text-sm">
        <h2 className="mb-1 text-lg font-semibold">Not available for your role</h2>
        <p className="text-slate-600">Your role ({session.role}) cannot open this screen.</p>
      </div>
    );
  }
  return <>{children}</>;
}
