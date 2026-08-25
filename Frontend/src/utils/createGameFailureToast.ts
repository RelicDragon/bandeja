import toast from 'react-hot-toast';
import type { TFunction } from 'i18next';
import { sharedPlayIntentErrorTranslationKey } from '@/components/playIntent/sharedPlayIntentError';
import { extractApiErrorMessage } from '@/utils/extractApiErrorMessage';

const GAME_MISMATCH_REASONS = new Set(['dates', 'clubs', 'time', 'level', 'gender']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function playIntentMismatchReason(error: unknown): string | undefined {
  if (!isRecord(error) || !isRecord(error.response) || !isRecord(error.response.data)) {
    return undefined;
  }
  const reason = error.response.data.reason;
  return typeof reason === 'string' && reason.trim() ? reason.trim() : undefined;
}

export function resolveCreateGameFailureToastKey(error: unknown): string {
  const playIntentKey = sharedPlayIntentErrorTranslationKey(error);
  if (playIntentKey === 'playIntent.gameMismatch') {
    const reason = playIntentMismatchReason(error);
    if (reason && GAME_MISMATCH_REASONS.has(reason)) {
      return `playIntent.gameMismatch_${reason}`;
    }
  }
  if (playIntentKey?.startsWith('playIntent.')) return playIntentKey;
  return '';
}

export function formatCreateGameFailureMessage(t: TFunction, error: unknown): string {
  const playIntentKey = resolveCreateGameFailureToastKey(error);
  if (playIntentKey) {
    return t(playIntentKey, { defaultValue: t('errors.generic') });
  }
  return extractApiErrorMessage(error, t);
}

export function toastCreateGameFailure(t: TFunction, error: unknown): void {
  toast.error(formatCreateGameFailureMessage(t, error));
}

export function createGameOrBookingErrorMessage(
  error: unknown,
  t: TFunction,
  bookingFallbackKey: string,
  bookingMessage: (error: unknown, t: TFunction, fallbackKey: string) => string,
): string {
  if (resolveCreateGameFailureToastKey(error)) {
    return formatCreateGameFailureMessage(t, error);
  }
  return bookingMessage(error, t, bookingFallbackKey);
}
