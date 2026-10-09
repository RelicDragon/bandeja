/**
 * Court reservation view — the ONE place display code turns a game payload into
 * the unified court-reservation vocabulary (`@shared/gameBooking/courtReservations`
 * + `reservationCopy`). Display code must not read `hasBookedCourt` /
 * `bookingStatus` directly.
 *
 * Payload generations handled:
 * - **Current** — `gameCourts[].reservation`, `reportedAnyCourtCount`,
 *   `linkedBookings[].gameCourtId` are present and used as-is.
 * - **Legacy** — none of those fields: `hasBookedCourt` (with no booking links)
 *   means every slot was reported; slots come from `gameCourts`, else `courtId`.
 * - **No links in the payload** (Find cards strip `linkedBookings`): the legacy
 *   `bookingStatus` is the only evidence of provider bookings, so
 *   `EXTERNAL_FULL` → all reserved and `EXTERNAL_PARTIAL` → an approximate
 *   "Partly booked" without counts.
 */
import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import type { Game } from '@/types';
import type { ResolvedDisplaySettings } from '@/utils/displayPreferences';
import { formatGameTimeInTimezone } from '@/utils/gameTimeDisplay';
import { playersPerMatchOf } from '@shared/matchFormat';
import { supportsClubBookingFlow } from '@shared/gameBooking/supportsClubBookingFlow';
import {
  computeRequiredCourtSlotCount,
  deriveCourtReservations,
  type CourtSlotView,
  type DeriveCourtReservationsInput,
  type GameCourtSlotInput,
  type ReservationLinkInput,
  type ReservationSummary,
} from '@shared/gameBooking/courtReservations';
import {
  COURT_RESERVATION_I18N_KEYS,
  describeCourtSlot,
  describeReservationSummary,
  isReservedByReportOnly,
  type ReservationCopy,
} from '@shared/gameBooking/reservationCopy';

export type CourtReservationGame = Pick<
  Game,
  | 'startTime'
  | 'endTime'
  | 'maxParticipants'
  | 'playersPerMatch'
  | 'sport'
  | 'timeIsSet'
  | 'courtId'
  | 'hasBookedCourt'
  | 'bookingStatus'
  | 'reportedAnyCourtCount'
  | 'courtSlotCount'
  | 'gameCourts'
  | 'linkedBookings'
>;

export type CourtReservationView = {
  summary: ReservationSummary;
  slots: CourtSlotView[];
  copy: ReservationCopy;
  /**
   * The summary came from the legacy `bookingStatus` because the payload has
   * no booking links; counts and gaps are unknown.
   */
  approximate: boolean;
};

/** Generic "Partly booked" for an approximate partial summary (no counts known). */
export const APPROXIMATE_PARTIAL_I18N_KEY = 'games.reservationPartly';

/**
 * English fallbacks, used only until the `courtReservation` locale bundle is
 * present (it is owned by the court-reservations feature). Mirrors
 * `locales/en/courtReservation.json`.
 */
// Keys come from the shared constants: `courtReservation` is an owned i18n
// namespace, and `namespaceCollisions.test.ts` rejects flat dotted literals of an owned namespace in src.
const ENGLISH_FALLBACKS: Readonly<Record<string, string>> = {
  [COURT_RESERVATION_I18N_KEYS.slot.planned]: 'Not booked',
  [COURT_RESERVATION_I18N_KEYS.slot.reported]: 'Booked by organizer',
  [COURT_RESERVATION_I18N_KEYS.slot.linked]: 'Booked · {{provider}}',
  [COURT_RESERVATION_I18N_KEYS.slot.unknownTime]: 'Booked · {{provider}} · time unknown',
  [COURT_RESERVATION_I18N_KEYS.slot.gap]: 'Gap {{from}}–{{to}}',
  [COURT_RESERVATION_I18N_KEYS.summary.planned]: 'Not booked',
  [COURT_RESERVATION_I18N_KEYS.summary.partial]: '{{reserved}} of {{total}} booked',
  [COURT_RESERVATION_I18N_KEYS.summary.reserved]: 'All courts booked',
  [COURT_RESERVATION_I18N_KEYS.summary.reservedWithGap]: 'Booked, gap at {{time}}',
  [COURT_RESERVATION_I18N_KEYS.summary.reported]: 'Booked by organizer',
  [APPROXIMATE_PARTIAL_I18N_KEY]: 'Partly booked',
};

/**
 * Whether a game has court slots worth describing: an entity that can carry a
 * club booking (GAME / TRAINING / TOURNAMENT / LEAGUE fixture) at a club.
 * BAR tables and EVENTs are not court slots.
 */
export function gameShowsCourtReservation(
  game: Pick<Game, 'entityType' | 'clubId' | 'club' | 'court' | 'courtBookingMode'>,
): boolean {
  if (!supportsClubBookingFlow(game.entityType, 'edit')) return false;
  // Game only: the organizer handles the court; there is no reservation state to show.
  if (game.courtBookingMode === 'GAME_ONLY') return false;
  return Boolean(game.clubId || game.club || game.court?.club);
}

function hasCurrentReservationFields(game: CourtReservationGame): boolean {
  return (
    game.reportedAnyCourtCount !== undefined ||
    (game.gameCourts ?? []).some((gc) => gc.reservation !== undefined) ||
    (game.linkedBookings ?? []).some((link) => link.gameCourtId !== undefined)
  );
}

/** Game payload → `deriveCourtReservations` input (pure). */
export function buildCourtReservationsInput(game: CourtReservationGame): DeriveCourtReservationsInput {
  const current = hasCurrentReservationFields(game);
  const links: ReservationLinkInput[] = (game.linkedBookings ?? []).map((link) => ({
    id: link.id,
    externalBookingId: link.externalBookingId,
    provider: link.externalBookingProvider,
    courtId: link.courtId ?? null,
    gameCourtId: link.gameCourtId ?? null,
    bookingStart: link.bookingStart ?? null,
    bookingEnd: link.bookingEnd ?? null,
  }));
  // Legacy: links overrode the manual flag, so `hasBookedCourt` only reports when no link exists.
  const legacyReported = !current && game.hasBookedCourt === true && links.length === 0;

  let gameCourts: GameCourtSlotInput[];
  if (game.gameCourts && game.gameCourts.length > 0) {
    gameCourts = game.gameCourts.map((gc) => ({
      gameCourtId: gc.id,
      courtId: gc.courtId,
      order: gc.order,
      reservation: current ? (gc.reservation ?? 'NONE') : legacyReported ? 'REPORTED' : 'NONE',
      reportedById: gc.reportedById ?? null,
      reportedAt: gc.reportedAt ?? null,
    }));
  } else if (game.courtId) {
    gameCourts = [
      {
        gameCourtId: `legacy:${game.courtId}`,
        courtId: game.courtId,
        order: 0,
        reservation: legacyReported ? 'REPORTED' : 'NONE',
      },
    ];
  } else {
    gameCourts = [];
  }

  const gameInput = {
    startTime: game.startTime,
    endTime: game.endTime,
    maxParticipants: game.maxParticipants,
    playersPerMatch: playersPerMatchOf(game),
    timeIsSet: game.timeIsSet ?? null,
  };
  const reportedAnyCourtCount = current
    ? (game.reportedAnyCourtCount ?? 0)
    : legacyReported
      ? computeRequiredCourtSlotCount(gameInput, gameCourts.length, game.courtSlotCount)
      : 0;

  return { game: gameInput, gameCourts, reportedAnyCourtCount, links, courtSlotCount: game.courtSlotCount ?? null };
}

/** Game payload → `{ summary, slots, copy }` (pure). */
export function selectCourtReservationView(game: CourtReservationGame): CourtReservationView {
  const result = deriveCourtReservations(buildCourtReservationsInput(game));
  const linksKnown = Array.isArray(game.linkedBookings) && game.linkedBookings.length > 0;
  const total = result.summary.total;

  if (!linksKnown && game.bookingStatus === 'EXTERNAL_FULL') {
    const summary: ReservationSummary = { kind: 'reserved', reserved: total, total, gapCount: 0 };
    return { summary, slots: result.slots, copy: describeReservationSummary(summary), approximate: true };
  }
  if (!linksKnown && game.bookingStatus === 'EXTERNAL_PARTIAL') {
    const reserved = Math.min(Math.max(result.summary.reserved, 0), total);
    const summary: ReservationSummary = { kind: 'partial', reserved, total, gapCount: 0 };
    const copy: ReservationCopy = {
      i18nKey: APPROXIMATE_PARTIAL_I18N_KEY,
      tone: 'warning',
      icon: 'calendar-half',
      params: {},
      timeParams: [],
    };
    return { summary, slots: result.slots, copy, approximate: true };
  }

  return {
    summary: result.summary,
    slots: result.slots,
    copy: describeReservationSummary(result.summary, { reportedOnly: isReservedByReportOnly(result.slots) }),
    approximate: false,
  };
}

/**
 * BAR: one hall/table, no court slots. Reserved → a single "Reserved" chip;
 * otherwise nothing (`null`).
 */
export function selectBarReservationView(
  game: Pick<Game, 'hasBookedCourt'>,
): CourtReservationView | null {
  if (game.hasBookedCourt !== true) return null;
  return {
    summary: { kind: 'reserved', reserved: 1, total: 1, gapCount: 0 },
    slots: [],
    copy: describeCourtSlot({ state: 'reported', provider: null, gaps: [], unknownTime: false }).label,
    approximate: false,
  };
}

export function useCourtReservationView(game: CourtReservationGame): CourtReservationView {
  return useMemo(() => selectCourtReservationView(game), [game]);
}

export type ReservationTimeFormatter = (iso: string) => string;

/** Formats ISO time params in the club's timezone with the viewer's 12/24h preference. */
export function reservationTimeFormatter(
  timeZone: string | null | undefined,
  settings: ResolvedDisplaySettings,
): ReservationTimeFormatter {
  const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (iso) => formatGameTimeInTimezone(iso, tz, settings);
}

/**
 * Renders a {@link ReservationCopy}. Looks the key up in the flat default
 * bundle first, then as the owned `courtReservation:` namespace, then falls
 * back to English — so it works whichever way the locale bundle is wired.
 */
export function formatReservationCopy(
  copy: ReservationCopy,
  t: TFunction,
  formatTime: ReservationTimeFormatter,
): string {
  const params: Record<string, string | number> = { ...copy.params };
  for (const name of copy.timeParams) {
    const value = params[name];
    if (typeof value === 'string') params[name] = formatTime(value);
  }
  const fallback = ENGLISH_FALLBACKS[copy.i18nKey] ?? copy.i18nKey;
  const namespacedKey = copy.i18nKey.replace(/^courtReservation\./, 'courtReservation:');
  const namespaced =
    namespacedKey === copy.i18nKey
      ? fallback
      : String(t(namespacedKey, { ...params, defaultValue: fallback }));
  return String(t(copy.i18nKey, { ...params, defaultValue: namespaced }));
}
