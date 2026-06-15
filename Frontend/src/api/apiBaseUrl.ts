import { isCapacitor } from '@/utils/capacitor';

export const DEFAULT_API_BASE_URL = 'https://bandeja.me/api';

function readViteApiBaseUrl(): string | undefined {
  const fromEnv = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!fromEnv?.trim()) return undefined;
  return fromEnv.trim().replace(/\/$/, '');
}

export function resolveNativeApiBaseUrl(): string {
  if (isCapacitor()) {
    return readViteApiBaseUrl() ?? DEFAULT_API_BASE_URL;
  }
  if (typeof window === 'undefined') {
    return readViteApiBaseUrl() ?? 'http://localhost:3000/api';
  }
  return `${window.location.origin}/api`;
}

export function getApiAxiosBaseURL(): string {
  if (isCapacitor()) return resolveNativeApiBaseUrl();
  return '/api';
}

export function resolveAbsoluteApiBaseUrlForFetch(): string {
  return resolveNativeApiBaseUrl();
}
