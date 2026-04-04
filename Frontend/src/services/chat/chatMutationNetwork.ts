import { useNetworkStore } from '@/utils/networkStatus';

export function shouldQueueChatMutation(): boolean {
  if (typeof navigator === 'undefined') return false;
  return !navigator.onLine || !useNetworkStore.getState().isOnline;
}

export function isRetryableMutationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return true;
  const err = error as { response?: { status?: number }; code?: string };
  if (err.code === 'ECONNABORTED' || err.code === 'ERR_NETWORK') return true;
  const status = err.response?.status;
  if (status == null) return true;
  if (status >= 500 || status === 408 || status === 429) return true;
  return false;
}
