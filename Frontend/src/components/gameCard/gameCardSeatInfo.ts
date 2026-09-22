import type { Game, GameParticipant } from '@/types';
import { getEntityCapabilities } from '@shared/entityCapabilities';
import {
  MIX_PAIRS_GENDER_TEAMS,
  countPlayingParticipants,
  countPlayingParticipantsOfGender,
  mixPairsMaxPerGender,
} from '@/utils/gameInviteInbox';

/**
 * PRD 359 — the two numbers a game card can already prove from its own payload:
 * how many seats are left, and where a queued viewer stands.
 *
 * Every field is nullable on purpose. A card that cannot prove a number shows
 * none: "1 seat left" that turns out to be a gendered seat the viewer cannot
 * take, or "2nd" computed from a roster the payload truncated, is worse than
 * the unchanged label.
 */
export interface GameCardSeatInfo {
  /** Seats **this viewer** could take, or `null` when the number would be a guess. */
  openSeats: number | null;
  /** Players waiting for a seat on this game. */
  queueLength: number;
  /** 1-based place of the viewer in that queue, or `null` when unknown. */
  viewerQueuePosition: number | null;
}

export const EMPTY_GAME_CARD_SEAT_INFO: GameCardSeatInfo = {
  openSeats: null,
  queueLength: 0,
  viewerQueuePosition: null,
};

export type SeatInfoGame = Pick<Game, 'entityType' | 'genderTeams' | 'maxParticipants'>;

export type SeatInfoViewer = {
  id?: string | null;
  gender?: string | null;
} | null | undefined;

const GENDERED_SEAT_VALUES = ['MALE', 'FEMALE'] as const;

/**
 * Queue order, matching `readQueueState` (PRD 347) exactly: `IN_QUEUE` rows by
 * their join time, earliest first. `readQueueState` itself reads `joinQueues`,
 * which only the game-detail payload carries — the card projections carry the
 * participant rows `joinQueues` is derived from, so this re-derives the same
 * list rather than duplicating a different rule. `gameCardSeatInfo.test.ts`
 * pins the two to the same answer.
 *
 * A row without a parsable `joinedAt` makes the whole order unknowable, so the
 * position is dropped instead of being guessed from array order.
 */
function readViewerQueuePosition(
  participants: readonly GameParticipant[],
  viewerUserId: string | null | undefined,
): { queueLength: number; viewerQueuePosition: number | null } {
  const queued = participants.filter((p) => p.status === 'IN_QUEUE');
  if (queued.length === 0) return { queueLength: 0, viewerQueuePosition: null };
  if (!viewerUserId || !queued.some((p) => p.userId === viewerUserId)) {
    return { queueLength: queued.length, viewerQueuePosition: null };
  }

  const timed = queued.map((p) => ({ userId: p.userId, at: Date.parse(p.joinedAt ?? '') }));
  if (timed.some((row) => Number.isNaN(row.at))) {
    return { queueLength: queued.length, viewerQueuePosition: null };
  }

  // `Array.prototype.sort` is stable, so equal timestamps keep payload order —
  // the same tie-break `readQueueState` gets.
  const ordered = [...timed].sort((a, b) => a.at - b.at);
  const index = ordered.findIndex((row) => row.userId === viewerUserId);
  return { queueLength: queued.length, viewerQueuePosition: index === -1 ? null : index + 1 };
}

/**
 * Seats open to `viewer`, or `null` when the count would mislead.
 *
 * `MIX_PAIRS` splits the roster in half by gender, so the honest number for a
 * viewer is the smaller of "seats left overall" and "seats left for my gender"
 * — and with no gender on the profile there is no honest number at all.
 */
function readOpenSeats(game: SeatInfoGame, participants: readonly GameParticipant[], viewer: SeatInfoViewer): number | null {
  const max = game.maxParticipants;
  if (max == null || max <= 0) return null;

  const totalOpen = Math.max(0, max - countPlayingParticipants(participants));
  if (game.genderTeams !== MIX_PAIRS_GENDER_TEAMS) return totalOpen;

  const gender = viewer?.gender ?? null;
  if (!gender || !(GENDERED_SEAT_VALUES as readonly string[]).includes(gender)) return null;

  const perGender = mixPairsMaxPerGender(max);
  if (perGender <= 0) return null;
  const openForGender = Math.max(0, perGender - countPlayingParticipantsOfGender(participants, gender));
  return Math.min(totalOpen, openForGender);
}

/**
 * The card's seat and queue facts. Pure: no query, no clock, no store — Find,
 * My and the chat list all call this with the roster they already hold.
 */
export function computeSeatInfo(
  game: SeatInfoGame,
  participants: readonly GameParticipant[] | null | undefined,
  viewer: SeatInfoViewer,
): GameCardSeatInfo {
  // An unbounded roster has no seats to count and no queue to stand in:
  // EVENT and BAR opt out of the whole feature here, once.
  if (getEntityCapabilities(game.entityType).unboundedRoster) {
    return EMPTY_GAME_CARD_SEAT_INFO;
  }

  const roster = participants ?? [];
  const { queueLength, viewerQueuePosition } = readViewerQueuePosition(roster, viewer?.id);

  return {
    openSeats: readOpenSeats(game, roster, viewer),
    queueLength,
    viewerQueuePosition,
  };
}
