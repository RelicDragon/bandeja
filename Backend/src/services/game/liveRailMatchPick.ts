/**
 * Which games earn a rail card without a live-scoring envelope, and which of
 * their matches the card shows.
 *
 * Deliberately free of prisma and env, like `liveRailOrder.ts`, so the rules
 * are unit-testable without a database.
 */
import type { EntityType, GameType } from '@prisma/client';

/**
 * Formats that end in standings, not a scoreline: one match out of many says
 * little to a stranger. Such a game still shows while it is live-scored, but
 * otherwise only for the viewer or someone they follow who is playing in it.
 */
const STANDINGS_GAME_TYPES: ReadonlySet<GameType> = new Set<GameType>([
  'AMERICANO',
  'MEXICANO',
  'ROUND_ROBIN',
  'WINNER_COURT',
  'LADDER',
  'KOTC',
]);

export function isStandingsFormat(game: { entityType: EntityType; gameType: GameType }): boolean {
  return game.entityType === 'TOURNAMENT' || STANDINGS_GAME_TYPES.has(game.gameType);
}

export type RailCardAudience = {
  /** League fixture of a public season: every viewer in the city sees it. */
  isLeagueFixture: boolean;
  standingsFormat: boolean;
  /** The viewer, or a player the viewer follows, is PLAYING in the game. */
  focusPlaying: boolean;
};

/**
 * A finished game (or one in progress without a live score) earns a card when
 * it is a league fixture, a game with a scoreline, or a standings game someone
 * the viewer cares about is playing.
 */
export function earnsRailCard(audience: RailCardAudience): boolean {
  if (audience.isLeagueFixture) return true;
  if (!audience.standingsFormat) return true;
  return audience.focusPlaying;
}

/** One match, flattened out of its round, in play order. */
export type RailMatchCandidate = {
  id: string;
  roundNumber: number;
  matchNumber: number;
  /** Two numbered sides are present, so the card has rows to draw. */
  hasBothTeams: boolean;
  /** At least one OFFICIAL set with a non-zero score. */
  scored: boolean;
  playerIds: readonly string[];
};

/** Round, then match number — the order the matches were played in. */
export function orderRailMatches<T extends Pick<RailMatchCandidate, 'roundNumber' | 'matchNumber'>>(
  matches: readonly T[],
): T[] {
  return [...matches].sort(
    (a, b) => a.roundNumber - b.roundNumber || a.matchNumber - b.matchNumber,
  );
}

function involves(match: RailMatchCandidate, focusUserIds: ReadonlySet<string>): boolean {
  return match.playerIds.some((id) => focusUserIds.has(id));
}

/**
 * Among `pool`, the focus players' matches when they have any, else all of it.
 * The focus narrows the pick; it never empties it.
 */
function preferFocus(
  pool: RailMatchCandidate[],
  focusUserIds: ReadonlySet<string>,
): RailMatchCandidate[] {
  if (focusUserIds.size === 0) return pool;
  const mine = pool.filter((match) => involves(match, focusUserIds));
  return mine.length > 0 ? mine : pool;
}

/**
 * The match a finished card shows: the last scored one, preferring a match the
 * viewer or a followed player took part in. `null` when nothing was scored.
 */
export function pickFinishedRailMatch(
  matches: readonly RailMatchCandidate[],
  focusUserIds: ReadonlySet<string>,
): RailMatchCandidate | null {
  const scored = orderRailMatches(matches).filter((m) => m.scored && m.hasBothTeams);
  const pool = preferFocus(scored, focusUserIds);
  return pool.length > 0 ? pool[pool.length - 1] : null;
}

/**
 * The match an in-progress card without a live score shows: the latest scored
 * one, or — before anything is entered — the first match still to be played.
 * Either way the focus players' matches win.
 */
export function pickProgressRailMatch(
  matches: readonly RailMatchCandidate[],
  focusUserIds: ReadonlySet<string>,
): RailMatchCandidate | null {
  // A followed player who has not scored yet still beats a stranger's result.
  const pool = preferFocus(
    orderRailMatches(matches).filter((m) => m.hasBothTeams),
    focusUserIds,
  );
  const scored = pool.filter((m) => m.scored);
  if (scored.length > 0) return scored[scored.length - 1];
  return pool[0] ?? null;
}

/**
 * Where the shown match sits in the game. A standings format counts rounds
 * (they are generated as the event goes, so there is no honest total); a game
 * with a scoreline counts matches. `null` for a single-match game.
 */
export type RailMatchPosition =
  | { kind: 'match'; index: number; count: number }
  | { kind: 'round'; round: number };

export function railMatchPosition(
  matches: readonly RailMatchCandidate[],
  pickedId: string,
  standingsFormat: boolean,
): RailMatchPosition | null {
  if (matches.length <= 1) return null;
  const ordered = orderRailMatches(matches);
  const index = ordered.findIndex((m) => m.id === pickedId);
  if (index < 0) return null;
  if (standingsFormat) return { kind: 'round', round: ordered[index].roundNumber };
  return { kind: 'match', index: index + 1, count: ordered.length };
}
