import type { AxiosError } from 'axios';

function jitterMs(base: number): number {
  return base + Math.floor(Math.random() * 350);
}

function retryAfterFromHeaders(e: AxiosError): number {
  const ra = e.response?.headers?.['retry-after'] ?? e.response?.headers?.['Retry-After'];
  if (ra == null) return 0;
  const s = String(ra).trim();
  const sec = parseInt(s, 10);
  if (!Number.isNaN(sec) && sec > 0) return Math.min(sec * 1000, 120_000);
  return 0;
}

export function isRetriableChatSyncError(e: unknown): boolean {
  const err = e as AxiosError;
  const s = err.response?.status;
  if (s === 429 || s === 408 || s === 502 || s === 503 || s === 504) return true;
  if (err.code === 'ECONNABORTED' || err.code === 'ERR_NETWORK') return true;
  if (err.request && !err.response) return true;
  return false;
}

export function isRetriableMessageCreateError(e: unknown): boolean {
  const err = e as AxiosError;
  const s = err.response?.status;
  if (s === 409) return false;
  if (s === 429 || s === 408 || s === 502 || s === 503 || s === 504) return true;
  if (err.code === 'ECONNABORTED' || err.code === 'ERR_NETWORK') return true;
  if (err.request && !err.response) return true;
  return false;
}

export async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export async function withChatSyncRetry<T>(label: string, fn: () => Promise<T>, maxAttempts = 6): Promise<T> {
  let attempt = 0;
  let delay = 700;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      attempt += 1;
      if (attempt >= maxAttempts || !isRetriableChatSyncError(e)) throw e;
      const axiosE = e as AxiosError;
      const fromHeader = retryAfterFromHeaders(axiosE);
      const wait = fromHeader > 0 ? fromHeader : jitterMs(Math.min(delay, 25_000));
      delay = Math.min(delay * 2, 25_000);
      if (import.meta.env.DEV) {
        console.warn(`[chatSync] ${label} retry ${attempt}/${maxAttempts} in ${wait}ms`, axiosE.response?.status);
      }
      await sleepMs(wait);
    }
  }
}

export async function withMessageCreateRetry<T>(fn: () => Promise<T>, maxAttempts = 10): Promise<T> {
  let attempt = 0;
  let delay = 700;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      attempt += 1;
      if (attempt >= maxAttempts || !isRetriableMessageCreateError(e)) throw e;
      const axiosE = e as AxiosError;
      const fromHeader = retryAfterFromHeaders(axiosE);
      const wait = fromHeader > 0 ? fromHeader : jitterMs(Math.min(delay, 25_000));
      delay = Math.min(delay * 2, 25_000);
      if (import.meta.env.DEV) {
        console.warn(`[chat] createMessage retry ${attempt}/${maxAttempts} in ${wait}ms`, axiosE.response?.status);
      }
      await sleepMs(wait);
    }
  }
}
