import axios from 'axios';
import { config } from '../config';
import { getSession, setSession } from '../auth/session';
import { toast } from '../lib/toast';

export interface ApiError {
  status: number;
  message: string;
  detail?: unknown;
  code?: string;
}

export function normalizeError(err: unknown): ApiError {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? 0;
    const data = err.response?.data as { detail?: unknown; code?: string } | undefined;
    const detail = data?.detail;
    let message: string;
    if (typeof detail === 'string') message = detail;
    else if (Array.isArray(detail)) message = detail.map((d: { msg?: string }) => d?.msg ?? JSON.stringify(d)).join('; ');
    else if (err.response) message = err.message;
    else message = err.code === 'ECONNABORTED' ? 'Request timed out' : 'Network error';
    return { status, message, detail, code: data?.code ?? err.code };
  }
  return { status: 0, message: err instanceof Error ? err.message : String(err) };
}

export const api = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: 15000,
});

// Backend uses header-based roles for the hackathon. When it moves to JWT,
// only this file and the login page change.
api.interceptors.request.use((cfg) => {
  const s = getSession();
  if (s) {
    cfg.headers['X-User'] = s.user;
    cfg.headers['X-Role'] = s.role;
  }
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const e = normalizeError(err);
    if (e.status === 401) {
      setSession(null);
      if (!location.pathname.startsWith('/login')) location.assign('/login');
    } else if (e.status === 403) {
      toast('Your role cannot do this', 'error');
    }
    return Promise.reject(e);
  },
);
