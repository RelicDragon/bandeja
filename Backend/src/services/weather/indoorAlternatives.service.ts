/**
 * PRD 357 — "Move indoor": which indoor courts at this club are free for the
 * game window.
 *
 * Availability comes from the **existing** `CourtOccupancyService.getOccupancy`,
 * which merges app games, admin holds and the Booktime / Padeloo / Klikteren
 * busy snapshots only (`docs/product/constraints.md` — NSPADELSUPABASE
 * availability lives behind `/api/nspadel/*` and is deliberately not part of
 * that merge). This endpoint therefore reports what the club schedule grid
 * reports, and nothing more.
 *
 * Applying the move is **not** done here: the caller posts the court change
 * through the existing edit path (`PUT /games/:id` + `POST /game-courts/game/:id`,
 * i.e. `GameUpdateService.updateGame` / `GameCourtService.setGameCourts`). A
 * linked external booking is never rebooked or cancelled — the response flags
 * it so the organizer is told, in words, that the old booking stays.
 */
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { CourtOccupancyService } from '../game/courtOccupancy.service';
import { detectOutdoor } from './weatherRisk';
import {
  selectIndoorAlternatives,
  type IndoorAlternativeCourt,
} from './indoorAlternativesRules';

export type { IndoorAlternativeCourt };

/** A court the game is currently booked on, in `gameCourts` order. */
export interface GameCurrentCourt {
  id: string;
  name: string;
  isIndoor: boolean;
}

export interface IndoorAlternativesResult {
  clubId: string | null;
  startTime: string;
  endTime: string;
  /** How many of the game's own courts are outdoor — drives "1 of 2 courts outdoor". */
  outdoorCourtCount: number;
  totalCourtCount: number;
  /**
   * The game's current courts, in order. The caller swaps the outdoor one it is
   * moving for the chosen indoor court and keeps the rest — a multi-court game
   * must not silently lose its indoor courts when one outdoor court moves.
   */
  currentCourts: GameCurrentCourt[];
  courts: IndoorAlternativeCourt[];
  /**
   * `true` when at least one linked external booking sits on a court of this
   * game. Moving the game does not move the booking.
   */
  hasLinkedBooking: boolean;
  linkedBookingCourtNames: string[];
  /** Mirrors the occupancy service — the club snapshot may still be refreshing. */
  isLoadingExternalSlots: boolean;
}

/**
 * Free indoor courts at the game's club for the game window.
 *
 * "Free" means: no hard block (club booking or blocking admin hold) and no
 * other app game already on that court. A block belonging to *this* game is
 * ignored, so a game already partly indoors still sees its own court as free.
 */
export async function getIndoorAlternatives(gameId: string): Promise<IndoorAlternativesResult> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      sport: true,
      clubId: true,
      startTime: true,
      endTime: true,
      timeIsSet: true,
      court: { select: { id: true, name: true, isIndoor: true, clubId: true } },
      gameCourts: {
        orderBy: { order: 'asc' },
        select: { court: { select: { id: true, name: true, isIndoor: true, clubId: true } } },
      },
      externalBookings: { select: { courtId: true } },
    },
  });
  if (!game) throw new ApiError(404, 'errors.weather.gameNotFound');

  const linkedCourts = game.gameCourts.length > 0
    ? game.gameCourts.map((link) => link.court)
    : game.court
      ? [game.court]
      : [];

  const detection = detectOutdoor({
    gameCourts: game.gameCourts.map((link) => ({ isIndoor: link.court.isIndoor })),
    primaryCourt: game.court ? { isIndoor: game.court.isIndoor } : null,
  });

  const clubId = game.clubId ?? game.court?.clubId ?? linkedCourts[0]?.clubId ?? null;
  const linkedBookingCourtIds = new Set(
    game.externalBookings.map((booking) => booking.courtId).filter((id): id is string => Boolean(id)),
  );
  const linkedBookingCourtNames = linkedCourts
    .filter((court) => linkedBookingCourtIds.has(court.id))
    .map((court) => court.name);

  const base: IndoorAlternativesResult = {
    clubId,
    startTime: game.startTime.toISOString(),
    endTime: game.endTime.toISOString(),
    outdoorCourtCount: detection.outdoorCourtCount,
    totalCourtCount: detection.totalCourtCount,
    currentCourts: linkedCourts.map((court) => ({
      id: court.id,
      name: court.name,
      isIndoor: court.isIndoor,
    })),
    courts: [],
    hasLinkedBooking: linkedBookingCourtIds.size > 0,
    linkedBookingCourtNames,
    isLoadingExternalSlots: false,
  };

  if (!clubId || !game.timeIsSet) return base;

  const indoorCourts = await prisma.court.findMany({
    where: {
      clubId,
      isIndoor: true,
      isActive: true,
      ...(game.sport ? { OR: [{ sport: game.sport }, { sport: null }] } : {}),
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  if (indoorCourts.length === 0) return base;

  const occupancy = await CourtOccupancyService.getOccupancy({
    clubId,
    rangeStart: game.startTime,
    rangeEnd: game.endTime,
    gameCourtFilter: 'player',
  });

  return {
    ...base,
    isLoadingExternalSlots: occupancy.isLoadingExternalSlots,
    courts: selectIndoorAlternatives({
      courts: indoorCourts,
      blocks: occupancy.blocks,
      start: game.startTime,
      end: game.endTime,
      excludeGameId: game.id,
    }),
  };
}
