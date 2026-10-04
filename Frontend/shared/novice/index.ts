/**
 * Novice mode (PRD #358) — the shared rank / unlock contract.
 *
 * Canonical source for Frontend and Backend (`@bandeja/shared/novice`). Ranks
 * are all sports combined, one per user, and monotonic: the server only ever
 * raises `User.noviceRank`. Gating here hides navigation entry points only —
 * novice rank never blocks a route (`docs/product/constraints.md`).
 */

export const NOVICE_RANK_IDS = [
  'newcomer',
  'debut',
  'rookie',
  'contender',
  'challenger',
  'regular',
] as const;

export type NoviceRankId = (typeof NOVICE_RANK_IDS)[number];

/** Counted games needed to become Regular (rank 5). Locked decision: X = 5. */
export const NOVICE_REGULAR_THRESHOLD = 5;

/** Highest novice rank (Regular). */
export const NOVICE_MAX_RANK = NOVICE_RANK_IDS.length - 1;

export type NoviceRankDefinition = {
  /** 0 (Newcomer) … 5 (Regular). Stored as `User.noviceRank`. */
  rank: number;
  id: NoviceRankId;
  /** Counted games needed to reach this rank. */
  minCountedGames: number;
};

export const NOVICE_RANKS: readonly NoviceRankDefinition[] = NOVICE_RANK_IDS.map(
  (id, rank) => ({ rank, id, minCountedGames: rank }),
);

function clampRank(rank: number): number {
  if (!Number.isFinite(rank)) return 0;
  return Math.max(0, Math.min(NOVICE_MAX_RANK, Math.floor(rank)));
}

/** Rank earned by a number of counted games (0 → Newcomer, ≥5 → Regular). */
export function noviceRankForCount(countedGames: number): number {
  if (!Number.isFinite(countedGames) || countedGames <= 0) return 0;
  const reached = NOVICE_RANKS.filter((r) => countedGames >= r.minCountedGames);
  return reached[reached.length - 1]?.rank ?? 0;
}

export function noviceRankId(rank: number): NoviceRankId {
  return NOVICE_RANK_IDS[clampRank(rank)];
}

/** Every navigation entry point novice mode can hide. */
export type NoviceFeature =
  | 'homeShell'
  | 'findTab'
  | 'calendar'
  | 'pastGames'
  | 'chatsTab'
  | 'followPlayers'
  | 'playStreak'
  | 'createGame'
  | 'topTab'
  | 'levelHistory'
  | 'playerComparison'
  | 'leagues'
  | 'tournaments'
  | 'marketTab'
  | 'stories'
  | 'liveRail'
  | 'userTeams'
  | 'aiAssistant'
  | 'wallet'
  | 'createLeague'
  | 'ads';

/**
 * Minimum novice rank at which each feature's entry point shows. Declaration
 * order is the reveal order inside one rank.
 */
export const NOVICE_FEATURE_MIN_RANK: Readonly<Record<NoviceFeature, number>> = {
  homeShell: 1,
  findTab: 1,
  calendar: 1,
  pastGames: 1,
  chatsTab: 2,
  followPlayers: 2,
  playStreak: 2,
  createGame: 2,
  topTab: 3,
  levelHistory: 3,
  playerComparison: 3,
  leagues: 4,
  tournaments: 4,
  marketTab: 4,
  stories: 4,
  liveRail: 4,
  userTeams: 4,
  aiAssistant: 5,
  wallet: 5,
  createLeague: 5,
  ads: 5,
};

export const NOVICE_FEATURES = Object.keys(NOVICE_FEATURE_MIN_RANK) as NoviceFeature[];

/**
 * The novice fields a user payload carries. Every field is optional: payloads
 * from before novice mode (or a guest) have none of them, and a user without
 * them is never in novice mode — novice mode must never hide UI by accident.
 */
export type NoviceUserFields = {
  noviceRank?: number | null;
  noviceCountedGames?: number | null;
  noviceMilestoneSeenRank?: number | null;
  noviceUnlockedAllAt?: string | Date | null;
};

/** Novice mode is on: rank below Regular and the user has not unlocked everything. */
export function isNoviceModeActive(user: NoviceUserFields | null | undefined): boolean {
  if (!user) return false;
  if (typeof user.noviceRank !== 'number') return false;
  if (user.noviceUnlockedAllAt) return false;
  return user.noviceRank < NOVICE_MAX_RANK;
}

/** 🌱 badge on rosters / player cards — same rule as novice mode being on. */
export const isNewcomerUser = isNoviceModeActive;

/** Whether a feature's navigation entry point is visible for this user. */
export function hasNoviceFeature(
  user: NoviceUserFields | null | undefined,
  feature: NoviceFeature,
): boolean {
  if (!isNoviceModeActive(user)) return true;
  return (user?.noviceRank ?? 0) >= NOVICE_FEATURE_MIN_RANK[feature];
}

/** Features revealed exactly at `rank` (for the reveal animation). */
export function featuresUnlockedAtRank(rank: number): NoviceFeature[] {
  return NOVICE_FEATURES.filter((feature) => NOVICE_FEATURE_MIN_RANK[feature] === rank);
}

/**
 * Features revealed by a jump from `fromRank` (exclusive) to `toRank`
 * (inclusive) — one combined celebration for a multi-rank jump.
 */
export function featuresUnlockedBetween(fromRank: number, toRank: number): NoviceFeature[] {
  return NOVICE_FEATURES.filter((feature) => {
    const min = NOVICE_FEATURE_MIN_RANK[feature];
    return min > fromRank && min <= toRank;
  });
}

/**
 * The client should play the celebration sequence: the server recorded a rank
 * the user has not acknowledged yet. Reaching Regular is still celebrated;
 * unlock-all users get no more celebrations.
 */
export function hasPendingNoviceCelebration(user: NoviceUserFields | null | undefined): boolean {
  if (!user || typeof user.noviceRank !== 'number') return false;
  if (user.noviceUnlockedAllAt) return false;
  return user.noviceRank > (user.noviceMilestoneSeenRank ?? 0);
}

/** Progress toward Regular for the "0/5 to Regular" meter. */
export function noviceProgressToRegular(countedGames: number | null | undefined): {
  current: number;
  target: number;
} {
  const n = typeof countedGames === 'number' && Number.isFinite(countedGames) ? countedGames : 0;
  const current = Math.max(0, Math.min(NOVICE_REGULAR_THRESHOLD, Math.floor(n)));
  return { current, target: NOVICE_REGULAR_THRESHOLD };
}
