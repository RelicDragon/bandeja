/**
 * Per-provider rules of the slot engine (docs/plans/ai-agent-booking.md §14.1, §14.3).
 */
import type { ClubIntegrationType } from '@prisma/client';
import type { AgentSlotConfidence } from '@bandeja/shared/agentContract';

/** `NONE`: the club has no booking integration (app games + holds only). */
export type SlotProvider = ClubIntegrationType | 'NONE';

/** How the engine learns about occupancy for a provider. */
export type SlotSourceKind = 'nspadel_live' | 'weltner_live' | 'snapshot' | 'app_only';

export function slotSourceKind(provider: SlotProvider): SlotSourceKind {
  switch (provider) {
    case 'NSPADELSUPABASE':
      return 'nspadel_live';
    case 'WELTNER':
      return 'weltner_live';
    // Klikteren: the public availability parser is FE-only and its payload shapes / time
    // semantics are unverified server-side, so it stays on the FE-written snapshot (§14.3).
    case 'BOOKTIME':
    case 'PADELOO':
    case 'KLIKTEREN':
      return 'snapshot';
    default:
      return 'app_only';
  }
}

export function sourceConfidence(kind: SlotSourceKind): AgentSlotConfidence {
  if (kind === 'nspadel_live' || kind === 'weltner_live') return 'live';
  return kind;
}

/**
 * Durations a provider can book (§14.1). Booktime's per-company `bookingDurations` come from
 * the Booktime API, which the backend must not call (no-outbound guard), so the engine uses
 * the documented 60/120 fallback. `NONE` accepts any 30-minute multiple up to 4 h.
 */
export function allowedDurations(provider: SlotProvider): number[] | null {
  switch (provider) {
    case 'BOOKTIME':
      return [60, 120];
    case 'PADELOO':
    case 'KLIKTEREN':
    case 'NSPADELSUPABASE':
      return [60, 90, 120];
    case 'WELTNER':
      return [60, 90, 120, 180];
    default:
      return null;
  }
}

export function isDurationAllowed(provider: SlotProvider, durationMinutes: number): boolean {
  const allowed = allowedDurations(provider);
  if (allowed) return allowed.includes(durationMinutes);
  return durationMinutes % 30 === 0 && durationMinutes >= 30 && durationMinutes <= 240;
}

/** Candidate start step in minutes. Weltner dictates its own starts (exact tuples). */
export const SLOT_STEP_MINUTES = 30;
