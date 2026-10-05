/**
 * Game page ↔ court-reservation feature glue (pure, no React, no I/O).
 *
 * The feature (`@/features/court-reservations`) owns the slot model, the
 * sheets and the reschedule planner; this module turns a `Game` + the club's
 * courts into the inputs those components need, and decides which flow a
 * "change time" or "reserve" tap takes.
 */
import type { Club, Court, Game } from '@/types';
import type { CourtSlotView } from '@shared/gameBooking/courtReservations';
import { parseInstantMs, type IsoInterval } from '@shared/gameBooking/coverageIntervals';
import type { GapFillResult, OccupancyBlock, SharedGameRef } from '@shared/gameBooking/planReschedule';
import { resolveProviderCapabilities, roundUpBookingMinutes } from '@shared/gameBooking/providerCapabilities';
import type { ExternalBookingProvider } from '@shared/gameBooking/contracts';
import { supportsClubBookingFlow } from '@shared/gameBooking/supportsClubBookingFlow';
import { clubHasBookingIntegration } from '@shared/clubIntegration';
import { deriveGameCourtReservations, type CourtRef } from '@/features/court-reservations';

/** The game's club entity (with courts + city for timezone-aware providers). */
export function resolveGameClub(game: Game, clubs?: readonly Club[], courts?: readonly Court[]): Club | undefined {
  const base =
    (game.clubId ? clubs?.find((c) => c.id === game.clubId) : undefined) ?? game.club ?? game.court?.club ?? undefined;
  if (!base) return undefined;
  const byId = new Map<string, Court>();
  for (const court of base.courts ?? []) byId.set(court.id, court);
  for (const court of courts ?? []) if (!court.clubId || court.clubId === base.id) byId.set(court.id, court);
  for (const gc of game.gameCourts ?? []) if (gc.court && !byId.has(gc.court.id)) byId.set(gc.court.id, gc.court);
  return {
    ...base,
    city: base.city ?? game.city ?? undefined,
    courts: [...byId.values()],
  } as Club;
}

export function buildCourtsById(club: Club | undefined, game: Game): Record<string, CourtRef> {
  const out: Record<string, CourtRef> = {};
  const add = (c: Court | undefined | null) => {
    if (!c?.id) return;
    out[c.id] = {
      id: c.id,
      name: c.name,
      externalCourtId: c.externalCourtId ?? null,
      isIndoor: c.isIndoor,
    };
  };
  for (const c of club?.courts ?? []) add(c);
  for (const gc of game.gameCourts ?? []) if (!out[gc.courtId]) add(gc.court);
  if (game.court && !out[game.court.id]) add(game.court);
  return out;
}

/**
 * Players who get the one time-change notice: PLAYING participants except the
 * editor (the backend never notifies the person making the change).
 */
export function timeChangeNoticeCount(
  game: Pick<Game, 'participants'>,
  editorUserId: string | null | undefined,
): number {
  return (game.participants ?? []).filter((p) => p.status === 'PLAYING' && p.userId !== editorUserId).length;
}

/** The game window, or `null` when no time is set yet. */
export function gameWindow(game: Pick<Game, 'startTime' | 'endTime' | 'timeIsSet'>): IsoInterval | null {
  if (game.timeIsSet === false || !game.startTime || !game.endTime) return null;
  if (parseInstantMs(game.startTime) == null || parseInstantMs(game.endTime) == null) return null;
  return { start: game.startTime, end: game.endTime };
}

/**
 * Whether court slots are a surface on this game's page: an entity that can
 * carry club bookings, at a club.
 */
export function gameHasCourtSlots(game: Game): boolean {
  if (!supportsClubBookingFlow(game.entityType, 'edit')) return false;
  return Boolean(game.clubId || game.club || game.court?.club);
}

/** DOM anchor of the Courts card (organizer next steps scroll here). */
export const GAME_COURTS_SECTION_ID = 'game-courts';

/** Whether the Courts card belongs on this game's page: an open game with court slots. */
export function gameShowsCourtsSection(game: Game): boolean {
  return (
    gameHasCourtSlots(game) &&
    game.resultsStatus === 'NONE' &&
    (game.status === 'ANNOUNCED' || game.status === 'STARTED')
  );
}

/**
 * Changing the time must go through the reschedule planner (RescheduleSheet)
 * when it can affect reservations: any linked reservation, or more than one
 * court slot. Everything else keeps the plain time editor.
 */
export function rescheduleNeeded(game: Game): boolean {
  if (!gameHasCourtSlots(game) || !gameWindow(game)) return false;
  if ((game.linkedBookings ?? []).length > 0) return true;
  return deriveGameCourtReservations(game).slots.length > 1;
}

/** The club can book through an integration this kind of game may use. */
export function clubCanBookHere(game: Game, club: Club | undefined): boolean {
  return supportsClubBookingFlow(game.entityType, 'edit') && clubHasBookingIntegration(club);
}

/* ------------------------------------------------------------------ *
 * 409 court.clash
 * ------------------------------------------------------------------ */

export const COURT_CLASH_CODE = 'court.clash';

export type CourtClashDetail = {
  courtId: string;
  start: string;
  end: string;
  kind?: string;
  gameId?: string | null;
};

/** `null` when `error` is not a 409 `court.clash`; otherwise its details (may be empty). */
export function courtClashDetails(error: unknown): CourtClashDetail[] | null {
  const response = (error as { response?: { status?: number; data?: Record<string, unknown> } } | null)?.response;
  const data = response?.data;
  if (!data || (data.code !== COURT_CLASH_CODE && data.message !== COURT_CLASH_CODE)) return null;
  const raw = Array.isArray(data.details) ? (data.details as unknown[]) : [];
  return raw.filter(
    (d): d is CourtClashDetail =>
      Boolean(d) &&
      typeof (d as CourtClashDetail).courtId === 'string' &&
      typeof (d as CourtClashDetail).start === 'string' &&
      typeof (d as CourtClashDetail).end === 'string',
  );
}

/** i18n key + params for a clash toast (first clash named when its court is known). */
export function describeCourtClash(
  details: readonly CourtClashDetail[],
  courtName: (courtId: string) => string | undefined,
  formatTime: (iso: string) => string,
): { key: string; params: Record<string, string> } {
  const first = details[0];
  const court = first ? courtName(first.courtId) : undefined;
  if (!first || !court) return { key: 'gameDetails.courts.clashGeneric', params: {} };
  return {
    key: 'gameDetails.courts.clash',
    params: { court, from: formatTime(first.start), to: formatTime(first.end) },
  };
}

/* ------------------------------------------------------------------ *
 * Reserve now
 * ------------------------------------------------------------------ */

export type ReserveEntry = {
  courtId: string;
  /** Real slot to place the link on (never a synthetic legacy id). */
  gameCourtId: string | null;
  start: string;
  durationMinutes: number;
};

export type ReservePlan = { ok: true; entries: ReserveEntry[] } | { ok: false; reason: 'no_time' | 'no_court' };

const HARD_KINDS = new Set<OccupancyBlock['kind']>(['club', 'hold', 'app_game_reserved']);

function overlaps(a: IsoInterval, b: { start: string; end: string }): boolean {
  const as = parseInstantMs(a.start);
  const ae = parseInstantMs(a.end);
  const bs = parseInstantMs(b.start);
  const be = parseInstantMs(b.end);
  if (as == null || ae == null || bs == null || be == null) return false;
  return as < be && bs < ae;
}

/**
 * Club courts an "Any court" slot may take: not used by another slot of this
 * game, and not hard-blocked (club booking, hold, another game's reserved
 * slot) over the window.
 */
export function freeCourtsForWindow(
  slots: readonly Pick<CourtSlotView, 'effectiveCourtId' | 'courtId'>[],
  clubCourts: readonly CourtRef[],
  occupancy: readonly OccupancyBlock[],
  window: IsoInterval | null,
): CourtRef[] {
  const used = new Set(slots.map((s) => s.effectiveCourtId ?? s.courtId).filter((id): id is string => Boolean(id)));
  return clubCourts.filter((court) => {
    if (used.has(court.id)) return false;
    if (!window) return true;
    return !occupancy.some((b) => b.courtId === court.id && HARD_KINDS.has(b.kind) && overlaps(window, b));
  });
}

function realGameCourtId(slot: Pick<CourtSlotView, 'gameCourtId'>): string | null {
  return slot.gameCourtId && !slot.gameCourtId.startsWith('legacy:') ? slot.gameCourtId : null;
}

/** Minutes the provider can actually book for `neededMinutes` (its durations / minimum), else the need itself. */
export function bookableMinutes(provider: string | null | undefined, neededMinutes: number): number {
  const caps = resolveProviderCapabilities(provider ?? null);
  if (!caps) return neededMinutes;
  return roundUpBookingMinutes(neededMinutes, caps) ?? neededMinutes;
}

/**
 * Bookings for "Reserve now" on `slots` over the game window (or one gap).
 * Any-court slots take a picked court, else the next free club court.
 */
export function planSlotReservations(args: {
  slots: readonly CourtSlotView[];
  allSlots: readonly CourtSlotView[];
  window: IsoInterval | null;
  provider: ExternalBookingProvider | string | null | undefined;
  clubCourts: readonly CourtRef[];
  occupancy: readonly OccupancyBlock[];
  /** Court picked in the sheet for an any-court slot. */
  pickedCourtId?: string | null;
}): ReservePlan {
  const span = args.window;
  if (!span) return { ok: false, reason: 'no_time' };
  const start = parseInstantMs(span.start);
  const end = parseInstantMs(span.end);
  if (start == null || end == null || end <= start) return { ok: false, reason: 'no_time' };
  const minutes = bookableMinutes(args.provider, Math.round((end - start) / 60000));
  const free = freeCourtsForWindow(args.allSlots, args.clubCourts, args.occupancy, args.window).map((c) => c.id);
  const entries: ReserveEntry[] = [];
  for (const slot of args.slots) {
    let courtId = slot.effectiveCourtId ?? slot.courtId;
    if (!courtId) {
      const picked = args.pickedCourtId && !entries.some((e) => e.courtId === args.pickedCourtId) ? args.pickedCourtId : null;
      courtId = picked ?? free.find((id) => !entries.some((e) => e.courtId === id)) ?? null;
    }
    if (!courtId) return { ok: false, reason: 'no_court' };
    entries.push({ courtId, gameCourtId: realGameCourtId(slot), start: span.start, durationMinutes: minutes });
  }
  return entries.length > 0 ? { ok: true, entries } : { ok: false, reason: 'no_court' };
}

/* ------------------------------------------------------------------ *
 * Fill the gap (shared `planGapFill`)
 * ------------------------------------------------------------------ */

/** `planGapFill` bookings → reserve entries on the slot (only when the plan is bookable). */
export function gapFillEntries(result: GapFillResult, slot: Pick<CourtSlotView, 'gameCourtId'>): ReserveEntry[] {
  if (result.unavailableReason) return [];
  return result.bookings.flatMap((b) => {
    const s = parseInstantMs(b.start);
    const e = parseInstantMs(b.end);
    if (s == null || e == null || e <= s) return [];
    return [{ courtId: b.courtId, gameCourtId: realGameCourtId(slot), start: b.start, durationMinutes: Math.round((e - s) / 60000) }];
  });
}

/**
 * Why a gap cannot be filled from the app, as an i18n key + params; `null`
 * when the plan is bookable. A clash names the court and the blocking time;
 * a provider that cannot book that length (or at all) → "ask the club".
 */
export function gapFillUnavailableMessage(
  result: GapFillResult,
  courtName: (courtId: string) => string | undefined,
  formatRange: (start: string, end: string) => string,
): { key: string; params: Record<string, string> } | null {
  switch (result.unavailableReason) {
    case undefined:
      return null;
    case 'clash': {
      const block = result.clash?.blocks[0];
      const court = result.clash ? courtName(result.clash.courtId) : undefined;
      return block && court
        ? { key: 'gameDetails.courts.gapClash', params: { court, time: formatRange(block.start, block.end) } }
        : { key: 'gameDetails.courts.clashGeneric', params: {} };
    }
    case 'duration_unavailable':
    case 'cannot_book':
      return { key: 'gameDetails.courts.gapAskClub', params: {} };
    default:
      return { key: 'gameDetails.courts.gapUnavailable', params: {} };
  }
}

/** Confirm copy when the bookings hold more than the gap: one "Adds 09:30–10:30" line per booking. */
export function gapExtraLines(
  result: GapFillResult,
  formatRange: (start: string, end: string) => string,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  const lines = result.bookings.map((b) => t('gameDetails.courts.gapAdds', { range: formatRange(b.start, b.end) }));
  return [...lines, t('gameDetails.courts.gapExtra', { minutes: result.extraMinutes })].join(' ');
}

/* ------------------------------------------------------------------ *
 * Shared reservations ("also used by …")
 * ------------------------------------------------------------------ */

export type LinkedGameRow = {
  id: string;
  name: string | null;
  startTime: string;
  endTime: string;
  linkBookingStart?: string | null;
  linkBookingEnd?: string | null;
};

/** Linked-games lookup → `sharedWith`, keyed by link id AND provider booking id; this game excluded. */
export function buildSharedWith(
  links: readonly { id: string; externalBookingId: string }[],
  linkedGames: ReadonlyMap<string, readonly LinkedGameRow[]>,
  ownGameId: string,
  fallbackName: string,
): Record<string, SharedGameRef[]> {
  const out: Record<string, SharedGameRef[]> = {};
  for (const link of links) {
    const others = (linkedGames.get(link.externalBookingId) ?? []).filter((g) => g.id !== ownGameId);
    if (others.length === 0) continue;
    const refs = others.map((g) => ({
      gameId: g.id,
      name: g.name?.trim() || fallbackName,
      start: g.startTime,
      end: g.endTime,
      // Viewer-scoped lookup: we only know they can SEE it, not edit it.
      canEdit: false,
    }));
    out[link.id] = refs;
    out[link.externalBookingId] = refs;
  }
  return out;
}

/** `GET /{slug}/linked-games/:id` per provider (Weltner has none). */
export function linkedGamesSlug(provider: string | null | undefined): string | null {
  switch (provider) {
    case 'BOOKTIME':
      return 'booktime';
    case 'PADELOO':
      return 'padeloo';
    case 'KLIKTEREN':
      return 'klikteren';
    case 'NSPADELSUPABASE':
      return 'nspadel';
    default:
      return null;
  }
}

/** Providers whose adapter can look a reservation up (`ClubBookingProvider.verifyBooking`). */
export function providerCanVerify(provider: string | null | undefined): boolean {
  return provider === 'BOOKTIME' || provider === 'PADELOO' || provider === 'KLIKTEREN';
}

/** Courts the edit tab may never drop: a linked reservation sits on them (unlink first). */
export function linkedCourtIds(game: Pick<Game, 'linkedBookings'>): Set<string> {
  return new Set((game.linkedBookings ?? []).map((l) => l.courtId).filter((id): id is string => Boolean(id)));
}
