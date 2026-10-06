/**
 * "When and where" editor save, in the court-slot model.
 *
 *  1. `PUT /games/:id?timePolicy=explicit` — club, main court (non-slot
 *     entities), and the time when the plain time editor changed it. With
 *     the explicit policy the server refuses a court clash (409 `court.clash`)
 *     and booking links never move the time.
 *  2. `PUT /games/:id/court-slots` (explicit) — the ordered courts + count,
 *     keeping each kept court's reported reservation. Links are never touched
 *     here; reservations live in the Courts card.
 *
 * Games whose time can affect bookings never send a time from here: the
 * editor runs the reschedule planner for them (see `rescheduleNeeded`).
 * `clearTime` removes the date and time; clearing the club sends `clubId: ''`
 * (the server drops the courts with it).
 *
 * Courts the organizer claimed ("It's my booking" — the club's block is their
 * own booking) are marked reserved FIRST (`claimBody`, existing courts only, so
 * it can never clash): the time move in step 1 then trusts them.
 */
import api from '@/api/axios';
import { courtSlotsApi, type CourtSlotsBody } from '@/api/courtSlots';
import type { Game } from '@/types';
import { parseInstantMs } from '@shared/gameBooking/coverageIntervals';
import { computeRequiredCourtSlotCount } from '@shared/gameBooking/courtReservations';
import { playersPerMatchOf } from '@shared/matchFormat';
import { buildCourtReservationsInput } from '@/utils/courtReservationView';

export type EditLocationTimeInput = {
  game: Game;
  clubId: string;
  /** Ordered courts (slot model) or `[courtId]` / `[]` (single-court entities). */
  courtIds: readonly string[];
  /** Slot model: GAME / TRAINING / TOURNAMENT / LEAGUE at a club. */
  slotModel: boolean;
  /** Organizer-chosen total court count (slot model); `null` = unchanged/default. */
  courtSlotCount: number | null;
  /** New window from the editor, or `null` (unchanged / planner-managed / cleared). */
  time: { startTime: string; endTime: string } | null;
  /** Remove the date and time (owners / admins). */
  clearTime?: boolean;
  /**
   * Courts that must be marked reserved (`REPORTED`); every other court is
   * `NONE`. Omitted: keep each kept court's current reservation.
   */
  reportedCourtIds?: ReadonlySet<string>;
  /** Set only when the organizer switched it (Club booking ⇄ Game only). */
  courtBookingMode?: 'CLUB' | 'GAME_ONLY';
};

export type EditLocationTimeRequests = {
  /** Mark already-kept courts reserved before the time moves (never adds courts). */
  claimBody: CourtSlotsBody | null;
  gamePatch: Record<string, unknown> | null;
  slotsBody: CourtSlotsBody | null;
};

export function initialCourtIds(game: Pick<Game, 'gameCourts' | 'courtId'>): string[] {
  if (game.gameCourts && game.gameCourts.length > 0) {
    return [...game.gameCourts].sort((a, b) => a.order - b.order).map((gc) => gc.courtId);
  }
  return game.courtId ? [game.courtId] : [];
}

function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = parseInstantMs(a ?? '');
  const y = parseInstantMs(b ?? '');
  return x != null && y != null && x === y;
}

export function timeChanged(game: Pick<Game, 'startTime' | 'endTime' | 'timeIsSet'>, time: EditLocationTimeInput['time']): boolean {
  if (!time) return false;
  if (game.timeIsSet === false) return true;
  return !sameInstant(game.startTime, time.startTime) || !sameInstant(game.endTime, time.endTime);
}

/** The court count the game uses now (what the edit stepper starts from). */
export function currentCourtSlotCount(game: Game): number {
  const input = buildCourtReservationsInput(game);
  return computeRequiredCourtSlotCount(
    { maxParticipants: game.maxParticipants, playersPerMatch: playersPerMatchOf(game) },
    input.gameCourts.length,
    game.courtSlotCount ?? null,
  );
}

export function buildEditLocationTimeRequests(input: EditLocationTimeInput): EditLocationTimeRequests {
  const { game, clubId, courtIds, slotModel, courtSlotCount, time, clearTime, reportedCourtIds, courtBookingMode } = input;
  const clubChanged = clubId !== (game.clubId ?? '');
  const before = initialCourtIds(game);
  const courtsChanged = courtIds.join(',') !== before.join(',');
  const countChanged = slotModel && courtSlotCount != null && courtSlotCount !== currentCourtSlotCount(game);

  const gamePatch: Record<string, unknown> = {};
  if (clubChanged) {
    gamePatch.clubId = clubId;
    gamePatch.courtId = courtIds[0] ?? '';
  } else if (!slotModel && courtsChanged) {
    gamePatch.courtId = courtIds[0] ?? '';
  }
  // Same request as the time: the server's clash guard reads the new mode.
  if (courtBookingMode && courtBookingMode !== (game.courtBookingMode ?? 'CLUB')) {
    gamePatch.courtBookingMode = courtBookingMode;
  }
  if (clearTime) {
    if (game.timeIsSet !== false) gamePatch.timeIsSet = false;
  } else if (time && timeChanged(game, time)) {
    gamePatch.startTime = time.startTime;
    gamePatch.endTime = time.endTime;
    gamePatch.timeIsSet = true;
  }

  const current = buildCourtReservationsInput(game);
  const currentReservationOf = (courtId: string) =>
    current.gameCourts.find((gc) => gc.courtId === courtId)?.reservation ?? 'NONE';
  const reservationOf = (courtId: string): 'NONE' | 'REPORTED' => {
    if (reportedCourtIds) return reportedCourtIds.has(courtId) ? 'REPORTED' : 'NONE';
    return clubChanged ? 'NONE' : currentReservationOf(courtId);
  };
  const reservationsChanged =
    slotModel && courtIds.some((courtId) => reservationOf(courtId) !== (clubChanged ? 'NONE' : currentReservationOf(courtId)));

  // Claims on courts the game already has: written before the time moves.
  let claimBody: CourtSlotsBody | null = null;
  if (slotModel && !clubChanged && reportedCourtIds) {
    const claims = before.filter((courtId) => reportedCourtIds.has(courtId) && currentReservationOf(courtId) !== 'REPORTED');
    if (claims.length > 0) {
      claimBody = {
        slots: before.map((courtId) => ({
          courtId,
          reservation: reportedCourtIds.has(courtId) ? 'REPORTED' : currentReservationOf(courtId),
        })),
        reportedAnyCourtCount: current.reportedAnyCourtCount ?? 0,
      };
    }
  }

  const claimed = claimBody?.slots ?? [];
  const claimCoversAll =
    claimBody != null &&
    !courtsChanged &&
    !countChanged &&
    courtIds.every((courtId) => claimed.find((slot) => slot.courtId === courtId)?.reservation === reservationOf(courtId));

  let slotsBody: CourtSlotsBody | null = null;
  if (slotModel && (clubChanged || courtsChanged || countChanged || reservationsChanged) && !claimCoversAll) {
    const total = Math.max(courtIds.length, courtSlotCount ?? currentCourtSlotCount(game), 1);
    const reportedAny = clubChanged ? 0 : Math.min(current.reportedAnyCourtCount ?? 0, Math.max(0, total - courtIds.length));
    slotsBody = {
      slots: courtIds.map((courtId) => ({ courtId, reservation: reservationOf(courtId) })),
      reportedAnyCourtCount: reportedAny,
      ...(countChanged && courtSlotCount != null ? { courtSlotCount: Math.max(courtSlotCount, courtIds.length) } : {}),
    };
  }

  return {
    claimBody,
    gamePatch: Object.keys(gamePatch).length > 0 ? gamePatch : null,
    slotsBody,
  };
}

export async function saveEditLocationTime(gameId: string, requests: EditLocationTimeRequests): Promise<void> {
  if (requests.claimBody) {
    await courtSlotsApi.putCourtSlots(gameId, requests.claimBody);
  }
  if (requests.gamePatch) {
    await api.put(`/games/${gameId}`, requests.gamePatch, { params: { timePolicy: 'explicit' } });
  }
  if (requests.slotsBody) {
    await courtSlotsApi.putCourtSlots(gameId, requests.slotsBody);
  }
}
