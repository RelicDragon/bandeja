import { resolveAbsoluteApiBaseUrlForFetch } from '@/api/apiBaseUrl';

/** NS Padel Centar (Novi Sad) — booked via real Bandeja backend endpoints. */
export function getNspadelApiUrl(): string {
  return `${resolveAbsoluteApiBaseUrlForFetch().replace(/\/$/, '')}/nspadel`;
}

/** Raw Supabase pass-through (kept for diagnostics; booking uses /availability + /bookings). */
export function getNspadelUpstreamUrl(): string {
  return `${getNspadelApiUrl()}/upstream`;
}

/** Booking widget durations (Singles 1v1 / Doubles 2v2): 60/90/120 min. */
export const NSPADEL_BOOKING_DURATIONS = [60, 90, 120] as const;

export const NSPADEL_SLOT_STEP_MINUTES = 30;

export type NspadelBookingDuration = number;

export const NSPADEL_DEFAULT_WORKING_HOURS = {
  openMinutes: 8 * 60,
  closeMinutes: 23 * 60,
} as const;
