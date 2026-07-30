import type { Game, GameSetupParams, MatchGenerationType, ScoringPreset } from '@/types';
import type { Sport } from '@shared/sport';
import {
  detectScoringMode,
  detectScoringPreset,
} from '@/utils/gameFormat';
import type { GameFormatTemplateSnapshot } from '@/utils/gameFormat/gameFormatSnapshot';
import { parseGameSport } from '@/utils/gameSport';

export const PLAYOFF_GAME_TYPE_SEEDS: Record<'WINNER_COURT' | 'AMERICANO', Partial<Game>> = {
  WINNER_COURT: { gameType: 'WINNER_COURT' },
  AMERICANO: { gameType: 'AMERICANO' },
};

const SESSION_AMERICANO_SCORING: Partial<
  Record<Sport, { scoringPreset: ScoringPreset; maxTotalPointsPerSet: number }>
> = {
  PADEL: { scoringPreset: 'POINTS_24', maxTotalPointsPerSet: 24 },
  PICKLEBALL: { scoringPreset: 'POINTS_21', maxTotalPointsPerSet: 21 },
  BADMINTON: { scoringPreset: 'POINTS_21', maxTotalPointsPerSet: 21 },
  TABLE_TENNIS: { scoringPreset: 'POINTS_11', maxTotalPointsPerSet: 11 },
};

/** Playoff wizard defaults: season fixture format, with optional playoff game-type override. */
export function playoffFormatInitialFromSeason(
  seasonGame: Partial<Game> | null | undefined,
  overrides?: Partial<Game>,
): Partial<Game> {
  return {
    maxParticipants: 4,
    ...(seasonGame ?? {}),
    ...overrides,
  };
}

export function bracketPlayoffFormatInitialFromSeason(
  seasonGame: Partial<Game>,
  confirmedSetup?: GameSetupParams | null,
): Partial<Game> {
  const fixtureCapacity = seasonGame.playersPerMatch === 2 ? 2 : 4;
  return playoffFormatInitialFromSeason(seasonGame, {
    ...(confirmedSetup ?? {}),
    maxParticipants: fixtureCapacity,
  });
}

/** Snapshot without roster-size generation clamp — preserves season HANDMADE/FIXED. */
export function bracketPlayoffFormatSnapshot(
  format: Partial<Game>,
): GameFormatTemplateSnapshot {
  const scoringPreset = detectScoringPreset(format) ?? 'CLASSIC_BEST_OF_3';
  return {
    scoringMode: detectScoringMode(format),
    scoringPreset,
    generationType: (format.matchGenerationType as MatchGenerationType) ?? 'AUTOMATIC',
    matchTimerEnabled: Boolean(format.matchTimerEnabled),
    matchTimedCapMinutes: format.matchTimedCapMinutes ?? 15,
    customPointsTotal: null,
    winnerOfGame: format.winnerOfGame ?? 'BY_MATCHES_WON',
    deucesBeforeGoldenPoint: format.deucesBeforeGoldenPoint ?? null,
  };
}

/** Session playoff scoring seeds per sport (L2); bracket keeps season CLASSIC defaults. */
export function leagueSessionPlayoffFormatInitial(
  seasonGame: Partial<Game> | null | undefined,
  gameType: 'WINNER_COURT' | 'AMERICANO',
): Partial<Game> {
  const overrides = PLAYOFF_GAME_TYPE_SEEDS[gameType];
  const base = playoffFormatInitialFromSeason(seasonGame, overrides);
  if (gameType !== 'AMERICANO' || seasonGame?.sport == null) return base;

  const sport = parseGameSport(seasonGame.sport);
  const scoring = SESSION_AMERICANO_SCORING[sport];
  if (!scoring) return base;

  return {
    ...base,
    scoringPreset: scoring.scoringPreset,
    maxTotalPointsPerSet: scoring.maxTotalPointsPerSet,
    scoringMode: 'POINTS',
  };
}
