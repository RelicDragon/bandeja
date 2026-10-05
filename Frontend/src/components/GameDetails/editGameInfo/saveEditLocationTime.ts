/**
 * Edit drawer → Location & time save, in the court-slot model.
 *
 *  1. `PUT /games/:id?timePolicy=explicit` — club, main court (non-slot
 *     entities), and the time when the plain time editor changed it. With
 *     the explicit policy the server refuses a court clash (409 `court.clash`)
 *     and booking links never move the time.
 *  2. `PUT /games/:id/court-slots` (explicit) — the ordered courts + count,
 *     keeping each kept court's reported reservation. Links are never touched
 *     here; reservations live in the Courts card.
 *
 * Games whose time can affect reservations never send a time from here: the
 * reschedule planner moves them (see `rescheduleNeeded`).
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
  /** New window from the plain time editor, or `null` (unchanged / planner-managed). */
  time: { startTime: string; endTime: string } | null;
};

export type EditLocationTimeRequests = {
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
  const { game, clubId, courtIds, slotModel, courtSlotCount, time } = input;
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
  if (time && timeChanged(game, time)) {
    gamePatch.startTime = time.startTime;
    gamePatch.endTime = time.endTime;
    gamePatch.timeIsSet = true;
  }

  let slotsBody: CourtSlotsBody | null = null;
  if (slotModel && (clubChanged || courtsChanged || countChanged)) {
    const current = buildCourtReservationsInput(game);
    const reservationOf = (courtId: string) =>
      clubChanged ? 'NONE' : current.gameCourts.find((gc) => gc.courtId === courtId)?.reservation ?? 'NONE';
    const total = Math.max(courtIds.length, courtSlotCount ?? currentCourtSlotCount(game), 1);
    const reportedAny = clubChanged ? 0 : Math.min(current.reportedAnyCourtCount ?? 0, Math.max(0, total - courtIds.length));
    slotsBody = {
      slots: courtIds.map((courtId) => ({ courtId, reservation: reservationOf(courtId) })),
      reportedAnyCourtCount: reportedAny,
      ...(countChanged && courtSlotCount != null ? { courtSlotCount: Math.max(courtSlotCount, courtIds.length) } : {}),
    };
  }

  return {
    gamePatch: Object.keys(gamePatch).length > 0 ? gamePatch : null,
    slotsBody,
  };
}

export async function saveEditLocationTime(gameId: string, requests: EditLocationTimeRequests): Promise<void> {
  if (requests.gamePatch) {
    await api.put(`/games/${gameId}`, requests.gamePatch, { params: { timePolicy: 'explicit' } });
  }
  if (requests.slotsBody) {
    await courtSlotsApi.putCourtSlots(gameId, requests.slotsBody);
  }
}
