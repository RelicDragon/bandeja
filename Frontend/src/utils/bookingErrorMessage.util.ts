import { AxiosError } from 'axios';
import type { TFunction } from 'i18next';
import type { BookingErrorCode, BookingProviderError } from '@shared/booking';
import { BOOKING_ERROR_KEYS } from '@shared/booking/errorKeys';
import { formatBooktimeErrorMessage } from '@/integrations/booktime/formatBooktimeErrorMessage';

type TFn = TFunction;

const CODE_TO_KEY: Record<BookingErrorCode, string> = {
  SlotTaken: BOOKING_ERROR_KEYS.slotNoLongerAvailable,
  AuthExpired: BOOKING_ERROR_KEYS.sessionExpired,
  RollbackFailed: BOOKING_ERROR_KEYS.rollbackFailed,
};

const LEGACY_MESSAGE_TO_KEY: Array<{ test: RegExp; key: string }> = [
  { test: /^Slot no longer available$/i, key: BOOKING_ERROR_KEYS.slotNoLongerAvailable },
  { test: /^Club booking session expired$/i, key: BOOKING_ERROR_KEYS.sessionExpired },
  { test: /^Online booking not configured for this court$/i, key: BOOKING_ERROR_KEYS.courtNotConfigured },
  { test: /^Club is not configured for online booking$/i, key: BOOKING_ERROR_KEYS.clubNotConfigured },
  { test: /^Club booking connection not found$/i, key: BOOKING_ERROR_KEYS.connectionNotFound },
  { test: /^Club booking config not found$/i, key: BOOKING_ERROR_KEYS.configNotFound },
  { test: /^Cancel booking failed$/i, key: BOOKING_ERROR_KEYS.cancelFailed },
  {
    test: /^External booking provider not configured$/i,
    key: BOOKING_ERROR_KEYS.providerNotConfigured,
  },
  {
    test: /^externalBookingProvider must be BOOKTIME when externalBookingIds is set$/i,
    key: BOOKING_ERROR_KEYS.externalProviderMustBeBooktime,
  },
  {
    test: /^Cannot set hasBookedCourt to false while booking links exist$/i,
    key: BOOKING_ERROR_KEYS.cannotClearBookedCourtWithLinks,
  },
  {
    test: /^add or remove must contain at least one booking id$/i,
    key: BOOKING_ERROR_KEYS.patchRequiresBookingId,
  },
  {
    test: /^Only owners and admins can update booking links$/i,
    key: BOOKING_ERROR_KEYS.updateLinksForbidden,
  },
  { test: /^Booking is already linked to this game$/i, key: BOOKING_ERROR_KEYS.alreadyLinked },
  {
    test: /^Only owners and admins can update booking snapshots$/i,
    key: BOOKING_ERROR_KEYS.updateSnapshotsForbidden,
  },
  { test: /^snapshots must be a non-empty array$/i, key: BOOKING_ERROR_KEYS.snapshotsRequired },
  {
    test: /^externalBookingId was removed; use externalBookingIds and PATCH \/games\/:id\/bookings$/i,
    key: BOOKING_ERROR_KEYS.legacyExternalBookingIdRejected,
  },
  {
    test: /^companyId is required for online booking integration$/i,
    key: BOOKING_ERROR_KEYS.companyIdRequired,
  },
  {
    test: /^Club integration type must be online booking$/i,
    key: BOOKING_ERROR_KEYS.integrationTypeMustBeOnlineBooking,
  },
];

function translateKey(t: TFn, key: string, params?: Record<string, string>): string {
  const translated = t(key, params);
  return translated !== key ? translated : key;
}

function extractResponsePayload(
  err: unknown,
): { message: string | null; params?: Record<string, string> } {
  if (!(err instanceof AxiosError)) return { message: null };
  const data = err.response?.data;
  if (typeof data !== 'object' || !data || !('message' in data)) return { message: null };
  const message = (data as { message?: unknown }).message;
  if (typeof message !== 'string' || !message.trim()) return { message: null };
  const params: Record<string, string> = {};
  const externalBookingId = (data as { externalBookingId?: unknown }).externalBookingId;
  if (typeof externalBookingId === 'string' && externalBookingId.trim()) {
    params.externalBookingId = externalBookingId.trim();
  }
  return { message: message.trim(), params: Object.keys(params).length > 0 ? params : undefined };
}

function resolveMessageKey(message: string): { key: string; params?: Record<string, string> } | null {
  if (message.startsWith('errors.booking.')) {
    return { key: message };
  }
  for (const rule of LEGACY_MESSAGE_TO_KEY) {
    if (rule.test.test(message)) {
      return { key: rule.key };
    }
  }
  const notLinked = /^Booking (.+) is not linked to this game$/.exec(message);
  if (notLinked) {
    return { key: BOOKING_ERROR_KEYS.bookingNotLinked, params: { externalBookingId: notLinked[1] } };
  }
  return null;
}

function isBookingProviderError(err: unknown): err is BookingProviderError {
  return (
    !!err &&
    typeof err === 'object' &&
    'code' in err &&
    'message' in err &&
    typeof (err as BookingProviderError).code === 'string' &&
    typeof (err as BookingProviderError).message === 'string'
  );
}

export function isBookingAuthExpiredMessage(message: string): boolean {
  if (message === BOOKING_ERROR_KEYS.sessionExpired) return true;
  return /session|expired|401/i.test(message);
}

export function bookingErrorMessage(err: unknown, t: TFn, fallbackKey = 'errors.generic'): string {
  if (isBookingProviderError(err)) {
    const key = CODE_TO_KEY[err.code];
    if (key) return translateKey(t, key);
  }

  const responsePayload = extractResponsePayload(err);
  if (responsePayload.message) {
    const resolved = resolveMessageKey(responsePayload.message);
    if (resolved) {
      return translateKey(t, resolved.key, resolved.params ?? responsePayload.params);
    }
  }

  const raw = formatBooktimeErrorMessage(err);
  if (raw) {
    const resolved = resolveMessageKey(raw);
    if (resolved) {
      return translateKey(t, resolved.key, resolved.params);
    }
    return raw;
  }

  return t(fallbackKey);
}

export function localizeBookingErrorText(message: string | null | undefined, t: TFn): string | null {
  if (!message?.trim()) return null;
  const resolved = resolveMessageKey(message.trim());
  if (resolved) {
    return translateKey(t, resolved.key, resolved.params);
  }
  return message.trim();
}
