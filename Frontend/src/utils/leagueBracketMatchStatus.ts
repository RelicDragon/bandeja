import type { BracketSlotGameSummary } from '@/api/leagues';
import type { Game } from '@/types';
import type { Round } from '@/types/gameResults';
import { matchSetsHaveAnyNonZeroScore } from '@/utils/scoring/matchWinner';

export type BracketMatchStatus =
  | 'TBD'
  | 'READY'
  | 'SCHEDULED'
  | 'LIVE'
  | 'FINAL'
  | 'WALKOVER'
  | 'FORFEIT';

export type NonRallyOutcomeKind = 'WALKOVER' | 'DEFAULT' | 'RETIRED';

type GameLike = Game | BracketSlotGameSummary;

export function isBracketMatchComplete(status: BracketMatchStatus): boolean {
  return status === 'FINAL' || status === 'WALKOVER' || status === 'FORFEIT';
}

function readNonRallyOutcome(meta: unknown): NonRallyOutcomeKind | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const v = (meta as { nonRallyOutcome?: unknown }).nonRallyOutcome;
  if (typeof v !== 'string') return null;
  const u = v.trim().toUpperCase();
  if (u === 'WALKOVER' || u === 'DEFAULT' || u === 'RETIRED') return u;
  return null;
}

export function extractNonRallyOutcome(
  game: Game | null | undefined,
  rounds?: Round[] | null
): NonRallyOutcomeKind | null {
  if (!game) return null;

  const fromGameMeta = readNonRallyOutcome(game.metadata);
  if (fromGameMeta) return fromGameMeta;

  const gameRounds = rounds ?? game.rounds;
  for (const round of gameRounds ?? []) {
    for (const match of round.matches ?? []) {
      const fromMatch = readNonRallyOutcome(match.metadata);
      if (fromMatch) return fromMatch;
    }
  }
  return null;
}

function gameHasPlayedSetScores(game: Game, rounds?: Round[] | null): boolean {
  const gameRounds = rounds ?? game.rounds;
  if (!gameRounds?.length) return false;
  return gameRounds.some((round) =>
    round.matches.some((match) => matchSetsHaveAnyNonZeroScore(match.sets))
  );
}

function resolveFinalBracketStatus(game: Game, rounds?: Round[] | null): BracketMatchStatus {
  const nonRally = extractNonRallyOutcome(game, rounds);
  if (nonRally === 'WALKOVER') return 'WALKOVER';
  if (nonRally === 'DEFAULT' || nonRally === 'RETIRED') return 'FORFEIT';
  if (!gameHasPlayedSetScores(game, rounds)) return 'WALKOVER';
  return 'FINAL';
}

export function bracketMatchStatusFromGame(
  game: GameLike | null | undefined,
  opts?: { rounds?: Round[] | null }
): BracketMatchStatus {
  if (!game) return 'TBD';
  if (game.resultsStatus === 'FINAL') {
    if ('fixedTeams' in game || 'rounds' in game || 'metadata' in game) {
      return resolveFinalBracketStatus(game as Game, opts?.rounds);
    }
    return 'FINAL';
  }
  if (game.resultsStatus === 'IN_PROGRESS') return 'LIVE';
  if (game.startTime) return 'SCHEDULED';
  return 'READY';
}

export function bracketMatchStatusBadgeClass(status: BracketMatchStatus): string {
  switch (status) {
    case 'FINAL':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200';
    case 'WALKOVER':
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800/80 dark:text-slate-200';
    case 'FORFEIT':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200';
    case 'LIVE':
      return 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200';
    case 'SCHEDULED':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200';
    case 'READY':
      return 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  }
}

export function bracketMatchStatusI18nKey(status: BracketMatchStatus): string {
  switch (status) {
    case 'FINAL':
      return 'bracketStatusFinal';
    case 'WALKOVER':
      return 'bracketStatusWalkover';
    case 'FORFEIT':
      return 'bracketStatusForfeit';
    case 'LIVE':
      return 'bracketStatusLive';
    case 'SCHEDULED':
      return 'bracketStatusScheduled';
    case 'READY':
      return 'bracketStatusReady';
    default:
      return 'bracketStatusTbd';
  }
}
