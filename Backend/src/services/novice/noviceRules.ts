/**
 * Novice mode (PRD #358) — pure counting / rank rules.
 *
 * Kept free of Prisma client calls so the rules are unit-testable; the DB side
 * lives in `noviceProgress.service.ts`. The SQL backfill in
 * `prisma/migrations/20261005210000_novice_mode` mirrors `countedGamesWhere`.
 */
import { EntityType, GameStatus, ParticipantStatus, type Prisma } from '@prisma/client';
import { NOVICE_MAX_RANK, noviceRankForCount } from '@bandeja/shared/novice';

/** Never a counted game, whatever rows exist. */
export const NOVICE_NON_COUNTING_ENTITY_TYPES: readonly EntityType[] = [
  EntityType.EVENT,
  EntityType.LEAGUE_SEASON,
];

/** Counted without a GameOutcome row (they rarely produce one) unless no-show. */
export const NOVICE_ATTENDANCE_COUNTED_ENTITY_TYPES: readonly EntityType[] = [
  EntityType.TRAINING,
  EntityType.BAR,
];

export const NOVICE_ENDED_GAME_STATUSES: readonly GameStatus[] = [
  GameStatus.FINISHED,
  GameStatus.ARCHIVED,
];

/**
 * A counted game: the user was PLAYING in a FINISHED/ARCHIVED game and either
 * has a GameOutcome row for it, or it is a TRAINING/BAR and they were not
 * noted as a no-show. Each participant row is one game, so a game counts once.
 */
export function countedGamesWhere(userId: string): Prisma.GameParticipantWhereInput {
  return {
    userId,
    status: ParticipantStatus.PLAYING,
    game: {
      status: { in: [...NOVICE_ENDED_GAME_STATUSES] },
      entityType: { notIn: [...NOVICE_NON_COUNTING_ENTITY_TYPES] },
    },
    OR: [
      { game: { outcomes: { some: { userId } } } },
      {
        noShowNotedAt: null,
        game: { entityType: { in: [...NOVICE_ATTENDANCE_COUNTED_ENTITY_TYPES] } },
      },
    ],
  };
}

export type CountedGameCandidate = {
  participantStatus: ParticipantStatus;
  noShowNotedAt: Date | null;
  hasOutcome: boolean;
  game: { status: GameStatus; entityType: EntityType };
};

/** In-memory mirror of {@link countedGamesWhere} (unit tests, diagnostics). */
export function isCountedGame(row: CountedGameCandidate): boolean {
  if (row.participantStatus !== ParticipantStatus.PLAYING) return false;
  if (!NOVICE_ENDED_GAME_STATUSES.includes(row.game.status)) return false;
  if (NOVICE_NON_COUNTING_ENTITY_TYPES.includes(row.game.entityType)) return false;
  if (row.hasOutcome) return true;
  return (
    NOVICE_ATTENDANCE_COUNTED_ENTITY_TYPES.includes(row.game.entityType) &&
    row.noShowNotedAt == null
  );
}

export type NoviceStoredProgress = {
  noviceCountedGames: number;
  noviceRank: number;
  noviceDebutGameId: string | null;
  noviceDebutHostUserId: string | null;
};

export type NoviceDebutCandidate = {
  gameId: string;
  /** OWNER participant of the game, if any. */
  ownerUserId: string | null;
};

export type NoviceRecountPlan = {
  countedGames: number;
  previousRank: number;
  newRank: number;
  /** Set only when the debut is established by this recount. */
  debut: { gameId: string; hostUserId: string | null } | null;
  changed: boolean;
};

/**
 * Decide what a recount writes.
 * - Rank is monotonic: `max(stored, rankFor(count))`. Undone results lower the
 *   honest count but never the rank.
 * - The debut is established once, on the 0 → ≥1 transition, at the user's
 *   earliest counted game. Users backfilled with games already counted never
 *   get a debut (no retroactive Talent Scout credit).
 * - No self-credit: a newcomer who owned their debut game has no host.
 */
export function planNoviceRecount(input: {
  userId: string;
  stored: NoviceStoredProgress;
  countedGames: number;
  firstCountedGame: NoviceDebutCandidate | null;
}): NoviceRecountPlan {
  const countedGames = Math.max(0, Math.floor(input.countedGames));
  const previousRank = Math.max(0, Math.min(NOVICE_MAX_RANK, input.stored.noviceRank));
  const newRank = Math.max(previousRank, noviceRankForCount(countedGames));

  let debut: NoviceRecountPlan['debut'] = null;
  if (
    input.stored.noviceDebutGameId == null &&
    input.stored.noviceCountedGames <= 0 &&
    countedGames >= 1 &&
    input.firstCountedGame
  ) {
    const owner = input.firstCountedGame.ownerUserId;
    debut = {
      gameId: input.firstCountedGame.gameId,
      hostUserId: owner && owner !== input.userId ? owner : null,
    };
  }

  const changed =
    countedGames !== input.stored.noviceCountedGames ||
    newRank !== input.stored.noviceRank ||
    debut != null;

  return { countedGames, previousRank, newRank, debut, changed };
}

/** `noviceMilestoneSeenRank` after an ack: never lowered, never past the earned rank. */
export function nextMilestoneSeenRank(params: {
  currentSeenRank: number;
  noviceRank: number;
  ackRank: number;
}): number {
  const ack = Number.isFinite(params.ackRank) ? Math.floor(params.ackRank) : 0;
  return Math.max(params.currentSeenRank, Math.min(ack, params.noviceRank));
}
