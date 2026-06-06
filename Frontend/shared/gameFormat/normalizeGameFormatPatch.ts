import { deriveBallsInGamesFromScoring } from './deriveBallsInGames';
import { goldenPointAllowedForFormat } from './goldenPointAllowed';
import { normalizeLegacyTimedScoringPreset } from './legacyTimedPreset';
import { resolveMatchGenerationType } from './resolveMatchGenerationType';

export type GameFormatExistingGame = {
  gameType?: string | null;
  sport?: string | null;
  playersPerMatch?: number | null;
  hasFixedTeams?: boolean | null;
  allowUserInMultipleTeams?: boolean | null;
  maxParticipants?: number | null;
  scoringPreset?: string | null;
  scoringMode?: string | null;
  matchTimerEnabled?: boolean | null;
  matchTimedCapMinutes?: number | null;
  maxTotalPointsPerSet?: number | null;
  winnerOfMatch?: string | null;
  winnerOfGame?: string | null;
  hasGoldenPoint?: boolean | null;
  ballsInGames?: boolean | null;
  fixedNumberOfSets?: number | null;
  maxPointsPerTeam?: number | null;
  matchGenerationType?: string | null;
  pointsPerWin?: number | null;
  pointsPerLoose?: number | null;
  pointsPerTie?: number | null;
  genderTeams?: string | null;
  affectsRating?: boolean | null;
};

export type GameFormatPatch = Record<string, unknown>;

export type EntityTypeStr = 'GAME' | 'LEAGUE' | 'LEAGUE_SEASON' | 'TRAINING' | string;

function timerEnabledForState(preset: string | null, matchTimerEnabled: boolean): boolean {
  return matchTimerEnabled || preset === 'TIMED' || preset === 'CLASSIC_TIMED';
}

function clampMatchTimedCapMinutes(raw: unknown, timerOn: boolean): number {
  const minutes =
    typeof raw === 'number' && Number.isFinite(raw) ? Math.min(60, Math.max(0, Math.round(raw))) : 0;
  if (!timerOn) return 0;
  if (minutes < 1) return 15;
  return minutes;
}

function resolvePlayersPerMatchCoupling(
  playersPerMatch: number,
  patch: GameFormatPatch,
  existing: GameFormatExistingGame,
): GameFormatPatch {
  const out: GameFormatPatch = {};
  if (playersPerMatch === 2) {
    out.hasFixedTeams = false;
    out.allowUserInMultipleTeams = false;
    return out;
  }

  const hasFixedTeams =
    patch.hasFixedTeams !== undefined
      ? Boolean(patch.hasFixedTeams)
      : Boolean(existing.hasFixedTeams);

  if (patch.hasFixedTeams !== undefined) {
    out.hasFixedTeams = hasFixedTeams;
  }

  if (!hasFixedTeams) {
    out.allowUserInMultipleTeams = false;
  } else if (patch.allowUserInMultipleTeams !== undefined) {
    out.allowUserInMultipleTeams = Boolean(patch.allowUserInMultipleTeams);
  }

  return out;
}

/**
 * Shared format normalization for create, update, and league fixture paths.
 * Merges `patch` over `existingGame`, applies scoring/timer/teams rules, returns writable fields.
 */
export function normalizeGameFormatPatch(params: {
  existingGame: GameFormatExistingGame;
  patch: GameFormatPatch;
  entityType: EntityTypeStr;
}): GameFormatPatch {
  const { existingGame, patch, entityType } = params;
  const out: GameFormatPatch = { ...patch };

  const sport = (patch.sport as string | undefined) ?? existingGame.sport ?? null;
  const maxParticipants =
    patch.maxParticipants !== undefined
      ? Number(patch.maxParticipants)
      : (existingGame.maxParticipants ?? 4);
  const playersPerMatch =
    patch.playersPerMatch !== undefined
      ? Number(patch.playersPerMatch)
      : (existingGame.playersPerMatch ?? 4);

  Object.assign(out, resolvePlayersPerMatchCoupling(playersPerMatch, patch, existingGame));

  if (patch.playersPerMatch !== undefined) {
    out.playersPerMatch = playersPerMatch;
  }

  let scoringPreset: string | null =
    patch.scoringPreset !== undefined
      ? (patch.scoringPreset as string | null)
      : (existingGame.scoringPreset ?? null);

  if (patch.scoringPreset !== undefined) {
    const legacy = normalizeLegacyTimedScoringPreset(scoringPreset);
    scoringPreset = legacy.scoringPreset;
    out.scoringPreset = scoringPreset;
    if (legacy.matchTimerEnabled) {
      out.matchTimerEnabled = true;
    }
    if (legacy.bumpPointsCapTo21) {
      const nextPts =
        patch.maxTotalPointsPerSet !== undefined
          ? patch.maxTotalPointsPerSet
          : existingGame.maxTotalPointsPerSet;
      if (typeof nextPts !== 'number' || nextPts < 1) {
        out.maxTotalPointsPerSet = 21;
      }
    }
  }

  if (patch.scoringMode !== undefined) {
    out.scoringMode = patch.scoringMode ?? null;
  }

  const effectivePreset =
    (out.scoringPreset as string | null | undefined) ?? scoringPreset;
  const effectiveTimerEnabled =
    out.matchTimerEnabled !== undefined
      ? Boolean(out.matchTimerEnabled)
      : patch.matchTimerEnabled !== undefined
        ? Boolean(patch.matchTimerEnabled)
        : Boolean(existingGame.matchTimerEnabled) ||
          normalizeLegacyTimedScoringPreset(scoringPreset).matchTimerEnabled;

  if (patch.matchTimerEnabled !== undefined) {
    out.matchTimerEnabled = Boolean(patch.matchTimerEnabled);
  } else if (out.matchTimerEnabled === undefined && effectiveTimerEnabled) {
    out.matchTimerEnabled = true;
  }

  const timerOn = timerEnabledForState(
    effectivePreset,
    out.matchTimerEnabled !== undefined ? Boolean(out.matchTimerEnabled) : effectiveTimerEnabled,
  );

  if (patch.matchTimedCapMinutes !== undefined) {
    out.matchTimedCapMinutes = clampMatchTimedCapMinutes(patch.matchTimedCapMinutes, timerOn);
  } else if (patch.scoringPreset !== undefined || patch.matchTimerEnabled !== undefined) {
    if (!timerOn) {
      out.matchTimedCapMinutes = 0;
    } else {
      const existingCap = existingGame.matchTimedCapMinutes ?? 0;
      out.matchTimedCapMinutes = clampMatchTimedCapMinutes(existingCap, true);
    }
  }

  const scoringMode =
    out.scoringMode !== undefined
      ? (out.scoringMode as string | null)
      : patch.scoringMode !== undefined
        ? (patch.scoringMode as string | null)
        : (existingGame.scoringMode ?? null);

  const hasGoldenPointInPatch = Object.prototype.hasOwnProperty.call(patch, 'hasGoldenPoint');
  const goldenPointTouched =
    patch.scoringMode !== undefined ||
    patch.scoringPreset !== undefined ||
    hasGoldenPointInPatch;

  if (goldenPointTouched) {
    const allowed = goldenPointAllowedForFormat(scoringMode, effectivePreset);
    if (!allowed) {
      out.hasGoldenPoint = false;
    } else if (hasGoldenPointInPatch) {
      out.hasGoldenPoint = Boolean(patch.hasGoldenPoint);
    }
  }

  const winnerOfMatch =
    (patch.winnerOfMatch as string | undefined) ??
    (existingGame.winnerOfMatch ?? 'BY_SCORES');
  const maxTotalPointsPerSet =
    out.maxTotalPointsPerSet !== undefined
      ? Number(out.maxTotalPointsPerSet)
      : patch.maxTotalPointsPerSet !== undefined
        ? Number(patch.maxTotalPointsPerSet)
        : (existingGame.maxTotalPointsPerSet ?? 0);

  const shouldDeriveBalls =
    patch.scoringPreset !== undefined ||
    patch.winnerOfMatch !== undefined ||
    patch.maxTotalPointsPerSet !== undefined ||
    patch.scoringMode !== undefined;

  if (shouldDeriveBalls) {
    out.ballsInGames = deriveBallsInGamesFromScoring({
      scoringPreset: effectivePreset,
      winnerOfMatch,
      maxTotalPointsPerSet,
      sport,
    });
  }

  if (patch.matchGenerationType !== undefined) {
    out.matchGenerationType = resolveMatchGenerationType({
      resultsRoundGenV2: patch.resultsRoundGenV2,
      matchGenerationType: patch.matchGenerationType,
      maxParticipants,
      playersPerMatch,
    });
  }

  if (entityType === 'LEAGUE_SEASON' && patch.winnerOfGame === 'BY_POINTS') {
    out.winnerOfGame =
      scoringMode === 'POINTS' ? 'BY_SCORES_DELTA' : 'BY_MATCHES_WON';
  }

  return out;
}

export {
  deriveBallsInGamesFromScoring,
  goldenPointAllowedForFormat,
  normalizeLegacyTimedScoringPreset,
  resolveMatchGenerationType,
};
