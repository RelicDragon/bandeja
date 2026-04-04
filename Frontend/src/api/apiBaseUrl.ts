import { isCapacitor } from '@/utils/capacitor';

export function getApiAxiosBaseURL(): string {
  if (isCapacitor()) return 'https://bandeja.me/api';
  return '/api';
}

export function resolveAbsoluteApiBaseUrlForFetch(): string {
  if (isCapacitor()) return 'https://bandeja.me/api';
  if (typeof window === 'undefined') {
    const u = import.meta.env.VITE_API_BASE_URL as string | undefined;
    return (u ?? 'http://localhost:3000/api').replace(/\/$/, '');
  }
  return `${window.location.origin}/api`;
}
