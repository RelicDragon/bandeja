/**
 * What each club booking provider can do, as far as rescheduling is concerned.
 *
 * No provider can modify a reservation in place; changing time means booking
 * a new interval (and possibly cancelling the old one). Every provider's
 * minimum booking is 60 minutes, so a 30-minute gap is closed by a 60-minute
 * booking. `idempotent: false` means a retried POST can double-book: the
 * executor must list the user's upcoming bookings before retrying.
 *
 * Pure data + helpers; callers may override per provider (e.g. Booktime
 * durations come from its API) via {@link resolveProviderCapabilities}.
 */
import type { ExternalBookingProvider } from './contracts';

export type ProviderCancelMode = 'api' | 'club';

export type ProviderCapabilities = {
  canBook: boolean;
  canCancel: boolean;
  canModify: boolean;
  minDurationMinutes: number;
  slotStepMinutes: number;
  /** Allowed booking lengths. When set, only these lengths can be booked. */
  durationsMinutes?: readonly number[];
  cancelMode: ProviderCancelMode;
  /** A retried booking request cannot create a second reservation. */
  idempotent: boolean;
  /** Availability is exact upstream `{start,duration}` tuples (Weltner). */
  exactSlots?: boolean;
};

export const DEFAULT_PROVIDER_CAPABILITIES: Readonly<Record<ExternalBookingProvider, ProviderCapabilities>> = {
  BOOKTIME: {
    canBook: true,
    canCancel: true,
    canModify: false,
    minDurationMinutes: 60,
    slotStepMinutes: 60,
    durationsMinutes: [60, 120],
    cancelMode: 'api',
    idempotent: false,
  },
  PADELOO: {
    canBook: true,
    canCancel: true,
    canModify: false,
    minDurationMinutes: 60,
    slotStepMinutes: 60,
    durationsMinutes: [60, 90, 120],
    cancelMode: 'api',
    idempotent: false,
  },
  KLIKTEREN: {
    canBook: true,
    canCancel: true,
    canModify: false,
    minDurationMinutes: 60,
    slotStepMinutes: 60,
    durationsMinutes: [60, 90, 120],
    cancelMode: 'api',
    idempotent: false,
  },
  NSPADELSUPABASE: {
    canBook: true,
    canCancel: false,
    canModify: false,
    minDurationMinutes: 60,
    slotStepMinutes: 30,
    durationsMinutes: [60, 90, 120],
    cancelMode: 'club',
    idempotent: true,
  },
  WELTNER: {
    canBook: true,
    canCancel: false,
    canModify: false,
    minDurationMinutes: 60,
    slotStepMinutes: 30,
    durationsMinutes: [60, 90, 120, 180],
    cancelMode: 'club',
    idempotent: true,
    exactSlots: true,
  },
};

export type ProviderCapabilityOverrides = Readonly<Record<string, Partial<ProviderCapabilities> | undefined>>;

/**
 * Defaults for `provider`, with any caller override merged on top. Unknown
 * providers without an override (or with an incomplete one) get `null`: the
 * plan falls back to "tell the club".
 */
export function resolveProviderCapabilities(
  provider: string | null | undefined,
  overrides?: ProviderCapabilityOverrides,
): ProviderCapabilities | null {
  if (!provider) return null;
  const base = (DEFAULT_PROVIDER_CAPABILITIES as Record<string, ProviderCapabilities | undefined>)[provider];
  const override = overrides?.[provider];
  if (!base && !override) return null;
  const merged = { ...(base ?? {}), ...(override ?? {}) } as Partial<ProviderCapabilities>;
  if (
    typeof merged.canBook !== 'boolean' ||
    typeof merged.canCancel !== 'boolean' ||
    typeof merged.minDurationMinutes !== 'number' ||
    typeof merged.slotStepMinutes !== 'number'
  ) {
    return null;
  }
  return {
    canBook: merged.canBook,
    canCancel: merged.canCancel,
    canModify: merged.canModify ?? false,
    minDurationMinutes: merged.minDurationMinutes,
    slotStepMinutes: merged.slotStepMinutes,
    durationsMinutes: merged.durationsMinutes,
    cancelMode: merged.cancelMode ?? (merged.canCancel ? 'api' : 'club'),
    idempotent: merged.idempotent ?? false,
    exactSlots: merged.exactSlots,
  };
}

function allowedDurations(caps: ProviderCapabilities): number[] | null {
  const list = (caps.durationsMinutes ?? []).filter((d) => Number.isFinite(d) && d > 0);
  if (list.length === 0) return null;
  return [...new Set(list)].sort((a, b) => a - b);
}

/**
 * Smallest bookable length that is at least `neededMinutes`: from the
 * provider's duration list when it has one, otherwise the minimum rounded up
 * to the slot step. `null` when nothing that long can be booked in one piece.
 */
export function roundUpBookingMinutes(neededMinutes: number, caps: ProviderCapabilities): number | null {
  if (!Number.isFinite(neededMinutes) || neededMinutes <= 0) return null;
  const floor = Math.max(neededMinutes, caps.minDurationMinutes > 0 ? caps.minDurationMinutes : 0);
  const durations = allowedDurations(caps);
  if (durations) {
    const fit = durations.find((d) => d >= floor);
    return fit ?? null;
  }
  const step = caps.slotStepMinutes > 0 ? caps.slotStepMinutes : 1;
  return Math.ceil(floor / step) * step;
}

/**
 * Lengths of consecutive bookings that together cover `neededMinutes`: one
 * booking when possible, otherwise the longest allowed duration repeated and a
 * rounded-up remainder. `null` for a non-positive need.
 */
export function planBookingDurations(neededMinutes: number, caps: ProviderCapabilities): number[] | null {
  if (!Number.isFinite(neededMinutes) || neededMinutes <= 0) return null;
  const single = roundUpBookingMinutes(neededMinutes, caps);
  if (single != null) return [single];
  const durations = allowedDurations(caps);
  if (!durations) return null;
  const longest = durations[durations.length - 1];
  const pieces: number[] = [];
  let remaining = neededMinutes;
  while (remaining > longest) {
    pieces.push(longest);
    remaining -= longest;
  }
  const last = roundUpBookingMinutes(remaining, caps);
  if (last == null) return null;
  pieces.push(last);
  return pieces;
}
