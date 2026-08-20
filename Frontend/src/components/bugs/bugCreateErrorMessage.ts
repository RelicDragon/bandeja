import { isAxiosError } from 'axios';

export const BUG_CREATE_ERROR_FALLBACK_KEY = 'bug.createError';
export const BUG_CREATE_NETWORK_ERROR_KEY = 'errors.networkError';

function trimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function messageFromUnknown(value: unknown, depth = 0): string | null {
  if (depth > 3) return null;
  const direct = trimmedString(value);
  if (direct) return direct;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = messageFromUnknown(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  if ('message' in value) {
    const fromMessage = messageFromUnknown(value.message, depth + 1);
    if (fromMessage) return fromMessage;
  }
  if ('error' in value) {
    return messageFromUnknown(value.error, depth + 1);
  }
  return null;
}

function axiosResponseMessage(error: unknown): string | null {
  if (!isAxiosError(error)) return null;
  const data = error.response?.data;
  if (typeof data !== 'object' || data === null) return null;
  return messageFromUnknown(data);
}

function isAxiosTransportFailure(error: unknown): boolean {
  return isAxiosError(error) && error.response == null;
}

export function extractBugCreateErrorMessage(error: unknown): string {
  const fromAxios = axiosResponseMessage(error);
  if (fromAxios) return fromAxios;
  if (isAxiosTransportFailure(error)) return BUG_CREATE_NETWORK_ERROR_KEY;
  if (isAxiosError(error)) return BUG_CREATE_ERROR_FALLBACK_KEY;
  if (error instanceof Error) {
    const message = trimmedString(error.message);
    if (message) return message;
  }
  const asString = trimmedString(error);
  if (asString) return asString;
  const fromObject = messageFromUnknown(error);
  if (fromObject) return fromObject;
  return BUG_CREATE_ERROR_FALLBACK_KEY;
}
