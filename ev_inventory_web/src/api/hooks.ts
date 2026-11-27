// One TanStack Query hook per endpoint, with the polling and invalidation
// rules from blueprint section 9.
import { useMutation, useQuery, useQueryClient, type QueryClient, type UseQueryOptions } from '@tanstack/react-query';
import * as E from './endpoints';
import { config } from '../config';
import type { ApiError } from './client';
import type { ApprovalIn, EventIn, SimulationIn } from './types';

type Opts<T> = Omit<UseQueryOptions<T, ApiError>, 'queryKey' | 'queryFn'>;

function useQ<T>(queryKey: unknown[], queryFn: () => Promise<T>, opts: Opts<T> = {}) {
  return useQuery<T, ApiError>({ queryKey, queryFn, ...opts });
}

const inv = (qc: QueryClient, ...keys: string[]) =>
  keys.forEach((k) => qc.invalidateQueries({ queryKey: k === 'risk' ? ['risk', 'latest'] : [k] }));

/* ---------- queries ---------- */
export const useInventory = () => useQ(['inventory'], E.getInventory, { refetchInterval: config.pollInventoryMs });
export const useMaterial = (id: string) =>
  useQ(['inventory', id], () => E.getMaterial(id), { refetchOnWindowFocus: true, enabled: !!id });
export const useShortages = () => useQ(['shortages'], E.getShortages, { refetchInterval: config.pollInventoryMs });

export const useOrders = (risk?: string, enabled = true) =>
  useQ(['orders', { risk: risk ?? null }], () => E.getOrders(risk), { refetchInterval: config.pollInventoryMs, enabled });
export const useOrder = (id: string) => useQ(['order', id], () => E.getOrder(id), { refetchOnWindowFocus: true, enabled: !!id });

export const useLatestRisk = (enabled = true) =>
  useQ(['risk', 'latest'], E.getLatestRisk, { refetchInterval: config.pollRiskMs, enabled });

export const useSuppliers = () => useQ(['suppliers'], E.getSuppliers, { staleTime: 5 * 60_000 });
export const useSupplierMaterials = (id: string, enabled: boolean) =>
  useQ(['suppliers', id, 'materials'], () => E.getSupplierMaterials(id), { enabled, staleTime: 5 * 60_000 });

export const useRecs = (status?: string, enabled = true) =>
  useQ(['recs', status ?? 'ALL'], () => E.getRecs(status), {
    refetchInterval: status === 'PENDING' ? config.pollAlertsMs : false,
    enabled,
  });
export const useRec = (id: string) => useQ(['rec', id], () => E.getRec(id), { refetchOnWindowFocus: true, enabled: !!id });

export const useAlerts = (role?: string) =>
  useQ(['alerts', role ?? 'ALL'], () => E.getAlerts(role), { refetchInterval: config.pollAlertsMs, enabled: !!role });

export const useHealth = (enabled = true) =>
  useQ(['health'], E.getHealth, { refetchInterval: config.pollHealthMs, enabled, retry: false });

export const useEvents = (status?: string, enabled = true) =>
  useQ(['events', status ?? 'ALL'], () => E.getEvents(status), { enabled });

/* ---------- mutations ---------- */
export function usePostEvent() {
  const qc = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof E.postEvent>>, ApiError, EventIn>({
    mutationFn: E.postEvent,
    // POST /events is idempotent by event_id, so retrying network failures is safe.
    retry: (n, e) => e.status === 0 && n < 2,
    onSuccess: () => inv(qc, 'inventory', 'shortages', 'risk', 'orders', 'health', 'events'),
  });
}

export function usePostEventsBatch() {
  const qc = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof E.postEventsBatch>>, ApiError, EventIn[]>({
    mutationFn: E.postEventsBatch,
    onSuccess: () => inv(qc, 'inventory', 'shortages', 'risk', 'orders', 'health', 'events'),
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, { product: string; qty: number; crd: string }>({
    mutationFn: E.createOrder,
    onSuccess: () => inv(qc, 'orders', 'risk', 'shortages'),
  });
}

export function useRunRisk() {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, void>({
    mutationFn: () => E.runRisk(),
    onSuccess: () => inv(qc, 'risk', 'orders', 'shortages', 'alerts'),
  });
}

export const useSimulate = () => useMutation<Awaited<ReturnType<typeof E.simulate>>, ApiError, SimulationIn>({ mutationFn: E.simulate });

export function useInvestigate() {
  const qc = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof E.investigate>>, ApiError, string>({
    mutationFn: E.investigate,
    retry: false,
    onSettled: () => inv(qc, 'recs', 'alerts'),
  });
}

export const useAsk = () => useMutation<Awaited<ReturnType<typeof E.askAgent>>, ApiError, string>({ mutationFn: E.askAgent, retry: false });

export function useDecide(id: string) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, ApprovalIn>({
    mutationFn: (body) => E.decide(id, body),
    retry: false,
    onSettled: () => {
      inv(qc, 'recs', 'rec', 'inventory', 'alerts', 'risk');
    },
  });
}

export function useAckAlert() {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: E.ackAlert,
    onSuccess: () => inv(qc, 'alerts'),
  });
}

export function useReplay() {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, void>({
    mutationFn: () => E.replay(),
    retry: false,
    onSuccess: () => qc.invalidateQueries(),
  });
}
