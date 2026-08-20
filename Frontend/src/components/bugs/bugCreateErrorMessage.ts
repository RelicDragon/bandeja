import { isAxiosError } from 'axios';

export const BUG_CREATE_ERROR_FALLBACK_KEY = 'bug.createError';

function trimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function axiosResponseMessage(error: unknown): string | null {
  if (!isAxiosError(error)) return null;
  const data = error.response?.data;
  if (typeof data === 'object' && data && 'message' in data) {
    return trimmedString(data.message);
  }
  if (typeof data === 'string') return trimmedString(data);
  return null;
}

export function extractBugCreateErrorMessage(error: unknown): string {
  const fromAxios = axiosResponseMessage(error);
  if (fromAxios) return fromAxios;
  if (error instanceof Error) {
    const message = trimmedString(error.message);
    if (message) return message;
  }
  const asString = trimmedString(error);
  if (asString) return asString;
  return BUG_CREATE_ERROR_FALLBACK_KEY;
}
