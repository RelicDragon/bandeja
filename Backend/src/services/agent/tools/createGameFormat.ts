/**
 * Create-template → `POST /games` format fields, for the agent's `create_game`.
 *
 * The app builds these in the browser: `applyCreateTemplate`
 * (`Frontend/src/utils/gameFormat/applyCreateTemplate.ts`) sets the format state from the
 * template, then `buildSetupFromFormat` (`utils/gameFormat/mergeGameFormat.ts`) turns it
 * into the payload using `config/scoringPresets.json` and `config/gameTypeTemplates.json`.
 * The backend has no copy of those two JSON files, so the rows the shared templates use
 * are copied below. KEEP IN SYNC with those files. Only template defaults are mirrored:
 * the agent never offers the app's inline tweaks (custom points total, timer options).
 */
import type { CreateTemplate } from '../../../shared/createTemplates';
import {
  clampDeucesBeforeGoldenPoint,
  deriveBallsInGamesFromScoring,
  goldenPointAllowedForFormat,
} from '../../../shared/gameFormat';
import {
  deriveGameType,
  scoringModeFromPreset,
  type MatchGenerationType,
  type ScoringPreset,
} from '../../../shared/isPresetLegal';
import { agentT } from '../i18n/agentI18n';

type PresetConfig = { winnerOfMatch: string; fixedNumberOfSets: number; maxTotalPointsPerSet: number };

/** `Frontend/src/config/scoringPresets.json` (ballsInGames is derived, not copied). */
const SCORING_PRESET_CONFIG: Record<string, PresetConfig> = {
  CLASSIC_BEST_OF_3: { winnerOfMatch: 'BY_SETS', fixedNumberOfSets: 3, maxTotalPointsPerSet: 0 },
  CLASSIC_AUTOMATIC: { winnerOfMatch: 'BY_SETS', fixedNumberOfSets: 3, maxTotalPointsPerSet: 0 },
  CLASSIC_BEST_OF_5: { winnerOfMatch: 'BY_SETS', fixedNumberOfSets: 5, maxTotalPointsPerSet: 0 },
  CLASSIC_PRO_SET: { winnerOfMatch: 'BY_SETS', fixedNumberOfSets: 1, maxTotalPointsPerSet: 0 },
  CLASSIC_SINGLE_SET: { winnerOfMatch: 'BY_SETS', fixedNumberOfSets: 1, maxTotalPointsPerSet: 0 },
  CLASSIC_SHORT_SET: { winnerOfMatch: 'BY_SETS', fixedNumberOfSets: 3, maxTotalPointsPerSet: 0 },
  CLASSIC_FAST4: { winnerOfMatch: 'BY_SETS', fixedNumberOfSets: 3, maxTotalPointsPerSet: 0 },
  CLASSIC_SUPER_TIEBREAK: { winnerOfMatch: 'BY_SETS', fixedNumberOfSets: 3, maxTotalPointsPerSet: 0 },
  CLASSIC_TIMED: { winnerOfMatch: 'BY_SETS', fixedNumberOfSets: 1, maxTotalPointsPerSet: 0 },
  POINTS_11: { winnerOfMatch: 'BY_SCORES', fixedNumberOfSets: 1, maxTotalPointsPerSet: 11 },
  POINTS_12: { winnerOfMatch: 'BY_SCORES', fixedNumberOfSets: 1, maxTotalPointsPerSet: 12 },
  POINTS_15: { winnerOfMatch: 'BY_SCORES', fixedNumberOfSets: 1, maxTotalPointsPerSet: 15 },
  POINTS_16: { winnerOfMatch: 'BY_SCORES', fixedNumberOfSets: 1, maxTotalPointsPerSet: 16 },
  POINTS_21: { winnerOfMatch: 'BY_SCORES', fixedNumberOfSets: 1, maxTotalPointsPerSet: 21 },
  POINTS_24: { winnerOfMatch: 'BY_SCORES', fixedNumberOfSets: 1, maxTotalPointsPerSet: 24 },
  POINTS_32: { winnerOfMatch: 'BY_SCORES', fixedNumberOfSets: 1, maxTotalPointsPerSet: 32 },
  BEST_OF_3_11: { winnerOfMatch: 'BY_SETS', fixedNumberOfSets: 3, maxTotalPointsPerSet: 11 },
  BEST_OF_3_15: { winnerOfMatch: 'BY_SETS', fixedNumberOfSets: 3, maxTotalPointsPerSet: 15 },
  BEST_OF_3_21: { winnerOfMatch: 'BY_SETS', fixedNumberOfSets: 3, maxTotalPointsPerSet: 21 },
  BEST_OF_5_11: { winnerOfMatch: 'BY_SETS', fixedNumberOfSets: 5, maxTotalPointsPerSet: 11 },
  PAR_11: { winnerOfMatch: 'BY_SCORES', fixedNumberOfSets: 1, maxTotalPointsPerSet: 11 },
  SINGLE_GAME_21: { winnerOfMatch: 'BY_SCORES', fixedNumberOfSets: 1, maxTotalPointsPerSet: 21 },
  TIMED: { winnerOfMatch: 'BY_SCORES', fixedNumberOfSets: 1, maxTotalPointsPerSet: 0 },
  CUSTOM: { winnerOfMatch: 'BY_SCORES', fixedNumberOfSets: 0, maxTotalPointsPerSet: 0 },
};

type GameTypeDefaults = {
  winnerOfMatch: string;
  pointsPerWin: number;
  pointsPerLoose: number;
  pointsPerTie: number;
  fixedNumberOfSets?: number;
};

/** `Frontend/src/config/gameTypeTemplates.json`. */
const GAME_TYPE_DEFAULTS: Record<string, GameTypeDefaults> = {
  CLASSIC: { winnerOfMatch: 'BY_SETS', pointsPerWin: 0, pointsPerLoose: 0, pointsPerTie: 0 },
  AMERICANO: { winnerOfMatch: 'BY_SCORES', pointsPerWin: 0, pointsPerLoose: 0, pointsPerTie: 0, fixedNumberOfSets: 1 },
  MEXICANO: { winnerOfMatch: 'BY_SCORES', pointsPerWin: 0, pointsPerLoose: 0, pointsPerTie: 0, fixedNumberOfSets: 1 },
  ROUND_ROBIN: { winnerOfMatch: 'BY_SCORES', pointsPerWin: 3, pointsPerLoose: 0, pointsPerTie: 1, fixedNumberOfSets: 1 },
  WINNER_COURT: { winnerOfMatch: 'BY_SCORES', pointsPerWin: 1, pointsPerLoose: 0, pointsPerTie: 0, fixedNumberOfSets: 1 },
  LADDER: { winnerOfMatch: 'BY_SCORES', pointsPerWin: 1, pointsPerLoose: 0, pointsPerTie: 0, fixedNumberOfSets: 1 },
  KOTC: { winnerOfMatch: 'BY_SCORES', pointsPerWin: 1, pointsPerLoose: 0, pointsPerTie: 0, fixedNumberOfSets: 1 },
  CUSTOM: { winnerOfMatch: 'BY_SCORES', pointsPerWin: 0, pointsPerLoose: 0, pointsPerTie: 0 },
};

/** `DEFAULT_PRESET_BY_MODE.POINTS` in `scoringCompatibility.ts`. */
const DEFAULT_POINTS_PRESET = 'POINTS_16';

/** `resolveCreateTemplateGeneration`: ≤ 5 players → automatic matches. */
export function templateGeneration(template: CreateTemplate, maxParticipants: number): MatchGenerationType {
  if (maxParticipants <= 5) return 'AUTOMATIC';
  return template.matchGenerationType as MatchGenerationType;
}

/** Format fields of the create body for a template at its defaults. */
export function buildTemplateFormatPayload(
  template: CreateTemplate,
  maxParticipants: number,
): Record<string, unknown> {
  const preset = String(template.scoringPreset);
  const scoringMode = scoringModeFromPreset(preset as ScoringPreset);
  const generation = templateGeneration(template, maxParticipants);

  // applyCreateTemplate: ranking
  const expectsScoresDelta = template.gameType === 'AMERICANO' || template.gameType === 'MEXICANO';
  const templateTypeDefaults = GAME_TYPE_DEFAULTS[template.gameType] ?? GAME_TYPE_DEFAULTS.CUSTOM;
  const ranking = expectsScoresDelta
    ? { winnerOfGame: 'BY_SCORES_DELTA', pointsPerWin: 0, pointsPerLoose: 0, pointsPerTie: 0 }
    : {
        winnerOfGame: 'BY_MATCHES_WON',
        pointsPerWin: templateTypeDefaults.pointsPerWin,
        pointsPerLoose: templateTypeDefaults.pointsPerLoose,
        pointsPerTie: templateTypeDefaults.pointsPerTie,
      };
  // applyCreateTemplate: timer + golden point
  const matchTimerEnabled = Boolean(template.matchTimerEnabled);
  const cap = matchTimerEnabled ? Math.min(60, Math.max(1, template.matchTimedCapMinutes ?? 15)) : 0;
  const rawDeuces =
    template.deucesBeforeGoldenPoint !== undefined
      ? template.deucesBeforeGoldenPoint
      : null;

  // buildSetupFromFormat
  const gameType = deriveGameType(scoringMode, generation);
  const derivedTypeDefaults = GAME_TYPE_DEFAULTS[gameType] ?? GAME_TYPE_DEFAULTS.CUSTOM;
  const timedNoTarget = scoringMode === 'POINTS' && matchTimerEnabled;
  const scoring = SCORING_PRESET_CONFIG[timedNoTarget ? DEFAULT_POINTS_PRESET : preset];
  const winnerOfMatch = scoring?.winnerOfMatch ?? derivedTypeDefaults.winnerOfMatch;
  const maxTotalPointsPerSet = timedNoTarget ? 0 : (scoring?.maxTotalPointsPerSet ?? 0);
  const scoringPreset = timedNoTarget ? null : preset;
  const deucesBeforeGoldenPoint = goldenPointAllowedForFormat(scoringMode, preset)
    ? clampDeucesBeforeGoldenPoint(rawDeuces)
    : null;
  return {
    gameType,
    scoringMode,
    scoringPreset,
    matchGenerationType: generation,
    winnerOfMatch,
    winnerOfGame: ranking.winnerOfGame,
    pointsPerWin: ranking.pointsPerWin,
    pointsPerLoose: ranking.pointsPerLoose,
    pointsPerTie: ranking.pointsPerTie,
    fixedNumberOfSets: scoring?.fixedNumberOfSets ?? derivedTypeDefaults.fixedNumberOfSets ?? 0,
    maxTotalPointsPerSet,
    matchTimedCapMinutes: cap,
    matchTimerEnabled,
    maxPointsPerTeam: 0,
    deucesBeforeGoldenPoint,
    ballsInGames: deriveBallsInGamesFromScoring({ scoringPreset, winnerOfMatch, maxTotalPointsPerSet }),
  };
}

/** `SOCIAL_LEVEL_BAND` for social templates; host level ± 0.7 (snapped to 0.1, 1–7) otherwise. */
export function defaultLevelBand(tier: 'social' | 'match', level: number | null): [number, number] {
  if (tier === 'social') return [2.0, 5.0];
  if (level == null || !Number.isFinite(level)) return [1.0, 7.0];
  const snap = (value: number) => Number((Math.round(Number((value / 0.1).toFixed(9))) * 0.1).toFixed(6));
  const clamp = (value: number) => Math.max(1.0, Math.min(7.0, value));
  return [snap(clamp(level - 0.7)), snap(clamp(level + 0.7))];
}

/** Human line for a template's scoring ("24 points · 15 min matches"). */
export function describeTemplateFormat(locale: string, template: CreateTemplate): string {
  const preset = String(template.scoringPreset);
  const parts: string[] = [];
  const points = /^POINTS_(\d+)$/.exec(preset);
  const rally = /^BEST_OF_(\d+)_(\d+)$/.exec(preset);
  const single = /^SINGLE_GAME_(\d+)$/.exec(preset);
  if (points) parts.push(agentT(locale, 'format.points', { points: points[1] }));
  else if (rally) parts.push(agentT(locale, 'format.bestOfGames', { sets: rally[1], points: rally[2] }));
  else if (single) parts.push(agentT(locale, 'format.oneGameTo', { points: single[1] }));
  else if (preset === 'CLASSIC_FAST4') parts.push(agentT(locale, 'format.fast4'));
  else if (preset === 'CLASSIC_SINGLE_SET' || preset === 'CLASSIC_PRO_SET') parts.push(agentT(locale, 'format.singleSet'));
  else if (/^CLASSIC_BEST_OF_(\d+)$/.test(preset)) {
    parts.push(agentT(locale, 'format.bestOfSets', { sets: preset.replace('CLASSIC_BEST_OF_', '') }));
  }
  if (template.matchTimerEnabled) {
    parts.push(agentT(locale, 'format.timer', { minutes: template.matchTimedCapMinutes ?? 15 }));
  }
  return parts.join(' · ');
}
