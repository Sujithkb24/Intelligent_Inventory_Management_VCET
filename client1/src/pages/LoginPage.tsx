import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLES, type Role } from '../api/types';
import { config } from '../config';
import { firebaseConfigured } from '../auth/firebase';
import { toast } from '../lib/toast';

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

function HeroAsterisk() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-12 w-12 text-white" aria-hidden="true">
      <line x1="24" y1="5" x2="24" y2="43" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
      <line x1="5" y1="24" x2="43" y2="24" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
      <line x1="10.5" y1="10.5" x2="37.5" y2="37.5" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
      <line x1="37.5" y1="10.5" x2="10.5" y2="37.5" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
    </svg>
  );
}

export default function LoginPage() {
  const { session, login, loginWithGoogle, register, resetPassword, loginDemo, logout } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('inventory_manager');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const demo = config.authMode === 'demo';

  if (session?.role) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (demo) {
        loginDemo({ user: user.trim(), role });
        nav('/');
      } else if (mode === 'signup') {
        await register(user.trim(), password);
        setNotice('Account created. Ask an administrator to assign your role before accessing operations.');
      } else {
        await login(user.trim(), password);
        nav('/');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setNotice('');
    setGoogleBusy(true);
    try {
      if (demo) {
        loginDemo({ user: user.trim() || 'google.user@sanchaya.ai', role });
        toast('Signed in with Google (demo mode)', 'info');
        nav('/');
      } else {
        await loginWithGoogle();
        nav('/');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    setError('');
    setNotice('');
    if (demo) {
      setNotice('Demo mode does not use passwords. Enter any username and pick a role.');
      return;
    }
    if (!user.trim()) {
      setError('Enter your email address above first so we can send a reset link.');
      return;
    }
    try {
      await resetPassword(user.trim());
      setNotice(`Password reset link sent to ${user.trim()}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return (
    <div className="grid min-h-screen w-full bg-white lg:grid-cols-2">
      {/* Left Brand Hero Panel */}
      <section className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#2B4BF2] via-[#2544E2] to-[#1A2FC4] px-8 py-10 text-white sm:px-14 sm:py-12 lg:px-16 lg:py-14">
        {/* Subtle curved geometric background lines inspired by reference */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-20"
          viewBox="0 0 800 900"
          fill="none"
          preserveAspectRatio="xMaxYMid slice"
          aria-hidden="true"
        >
          <path d="M240 -60 C520 140 620 480 420 960" stroke="white" strokeWidth="1.2" />
          <path d="M340 -60 C620 140 720 480 520 960" stroke="white" strokeWidth="1.2" />
          <path d="M440 -60 C720 140 820 480 620 960" stroke="white" strokeWidth="1.2" />
          <path d="M540 -60 C820 140 920 480 720 960" stroke="white" strokeWidth="1.2" />
        </svg>

        <div className="relative z-10 mt-4 sm:mt-8">
          <HeroAsterisk />
        </div>

        <div className="relative z-10 my-12 max-w-md space-y-5 lg:my-0">
          <h1 className="text-4xl font-bold leading-[1.12] tracking-[-0.02em] text-white sm:text-[46px]">
            Hello
            <br />
            <span>Sanchaya.ai</span>
          </h1>
          <p className="text-[15px] leading-relaxed text-white/85">
            Eliminate repetitive manual inventory checks and supply blind spots. Predict EV material shortages early and
            stay ahead through intelligent automation.
          </p>
        </div>

        <div className="relative z-10 text-xs text-white/65">
          © 2026 Sanchaya.ai. All rights reserved.
        </div>
      </section>

      {/* Right Authentication Form Panel */}
      <section className="flex flex-col items-center justify-center bg-white px-6 py-10 sm:px-12 lg:px-16">
        <div className="w-full max-w-[380px]">
          <div className="mb-10 text-xl font-bold tracking-[-0.015em] text-[#161B2E]">Sanchaya.ai</div>

          <h2 className="text-[28px] font-bold leading-9 tracking-[-0.015em] text-[#161B2E]">
            {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
          </h2>

          <p className="mt-2 text-[13px] leading-5 text-[#7A8199]">
            {mode === 'signin' ? (
              <>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setError('');
                    setNotice('');
                  }}
                  className="font-medium text-[#161B2E] underline underline-offset-2 hover:text-[#2554E8]"
                >
                  Create a new account now
                </button>
                ,
                <br />
                It&apos;s free and takes less than a minute.
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setError('');
                    setNotice('');
                  }}
                  className="font-medium text-[#161B2E] underline underline-offset-2 hover:text-[#2554E8]"
                >
                  Sign in here
                </button>
                .
              </>
            )}
          </p>

          {demo && (
            <div className="mt-4 rounded-[8px] border border-[#F6D79D] bg-[#FFF3DC] px-3 py-2 text-xs text-[#9A5B00]">
              Local demo mode only. Do not use this mode with a public backend.
            </div>
          )}

          {!demo && !firebaseConfigured && (
            <div className="mt-4 rounded-[8px] border border-[#F6D79D] bg-[#FFF3DC] px-3 py-2 text-xs text-[#9A5B00]">
              Firebase is not configured. Add the <code className="font-mono">VITE_FIREBASE_*</code> values to{' '}
              <code className="font-mono">client1/.env</code>.
            </div>
          )}

          {session && !session.role && (
            <div className="mt-4 space-y-2 rounded-[8px] border border-[#F6D79D] bg-[#FFF3DC] p-3 text-xs text-[#9A5B00]">
              <p>This account has no valid application role. Ask an administrator to assign one.</p>
              <button
                type="button"
                className="btn h-8 text-xs"
                onClick={() => logout().catch((reason: unknown) => setError(String(reason)))}
              >
                Sign out
              </button>
            </div>
          )}

          <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="sr-only" htmlFor="login-email">
                {demo ? 'Username or email' : 'Email address'}
              </label>
              <input
                id="login-email"
                type={demo ? 'text' : 'email'}
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder={demo ? 'name@sanchaya.ai' : 'name@sanchaya.ai'}
                autoComplete="email"
                autoFocus
                required
                className="w-full rounded-t-[6px] border-0 border-b border-[#CBD2E0] bg-white px-2.5 py-2.5 text-sm text-[#161B2E] placeholder:text-[#7A8199] transition-all duration-150 focus:border-[#161B2E] focus:shadow-[0_4px_14px_rgba(22,27,46,0.08)] focus:outline-none"
              />
            </div>

            {demo ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-[#7A8199]" htmlFor="login-role">
                  Role (demo only)
                </label>
                <select
                  id="login-role"
                  className="w-full border-0 border-b border-[#CBD2E0] bg-white px-2.5 py-2 text-sm text-[#161B2E] focus:border-[#161B2E] focus:outline-none"
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
            ) : (
              <div>
                <label className="sr-only" htmlFor="login-password">
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                  className="w-full rounded-t-[6px] border-0 border-b border-[#CBD2E0] bg-white px-2.5 py-2.5 text-sm text-[#161B2E] placeholder:text-[#7A8199] transition-all duration-150 focus:border-[#161B2E] focus:shadow-[0_4px_14px_rgba(22,27,46,0.08)] focus:outline-none"
                />
              </div>
            )}

            {error && (
              <p role="alert" className="rounded-[8px] border border-[#F3C5C2] bg-[#FDECEA] px-3 py-2 text-xs text-[#B42318]">
                {error}
              </p>
            )}

            {notice && (
              <p role="status" className="rounded-[8px] border border-[#BBE5CE] bg-[#E3F6EC] px-3 py-2 text-xs text-[#067647]">
                {notice}
              </p>
            )}

            <div className="space-y-3 pt-2">
              <button
                type="submit"
                disabled={!user.trim() || (!demo && !password) || busy || googleBusy || (!demo && !firebaseConfigured)}
                className="flex h-11 w-full items-center justify-center rounded-[8px] bg-[#161B2E] px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#232A45] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? 'Please wait…' : mode === 'signin' ? 'Login Now' : 'Create Account'}
              </button>

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={busy || googleBusy || (!demo && !firebaseConfigured)}
                className="flex h-11 w-full items-center justify-center gap-2.5 rounded-[8px] border border-[#CBD2E0] bg-white px-4 text-sm font-semibold text-[#161B2E] transition-colors duration-150 hover:bg-[#F5F7FB] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <GoogleLogo />
                <span>{googleBusy ? 'Connecting to Google…' : 'Login with Google'}</span>
              </button>
            </div>
          </form>

          <p className="mt-6 text-center text-xs text-[#7A8199]">
            Forget password{' '}
            <button
              type="button"
              onClick={handleForgotPassword}
              className="font-semibold text-[#161B2E] underline underline-offset-2 hover:text-[#2554E8]"
            >
              Click here
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}
