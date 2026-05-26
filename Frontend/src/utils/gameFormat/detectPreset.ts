import { Game, ScoringMode, ScoringPreset } from '@/types';
import { scoringModeFromPreset } from './scoringCompatibility';
import { getScoringPresetConfig } from './mergeGameFormat';

export const detectScoringPreset = (game?: Partial<Game> | null): ScoringPreset | null => {
  if (!game) return null;
  if (game.scoringPreset) return game.scoringPreset as ScoringPreset;

  const sets = game.fixedNumberOfSets ?? 0;
  const pts = game.maxTotalPointsPerSet ?? 0;
  const winnerOfMatch = game.winnerOfMatch;

  if (winnerOfMatch === 'BY_SETS') {
    if (sets === 3 && pts === 21) return 'BEST_OF_3_21';
    if (sets === 3 && pts === 11) return 'BEST_OF_3_11';
    if (sets === 5 && pts === 11) return 'BEST_OF_5_11';
    if (sets === 3) return 'CLASSIC_BEST_OF_3';
    if (sets === 5) return 'CLASSIC_BEST_OF_5';
    if (sets === 1) return 'CLASSIC_PRO_SET';
  }
  if (pts === 11) return 'POINTS_11';
  if (pts === 16) return 'POINTS_16';
  if (pts === 21) return 'POINTS_21';
  if (pts === 24) return 'POINTS_24';
  if (pts === 32) return 'POINTS_32';
  if (winnerOfMatch === 'BY_SCORES' && sets === 1 && pts === 0) return 'POINTS_21';
  return null;
};

/** Derive ScoringMode from a game — prefers explicit scoringMode field, then scoringPreset, then heuristics. */
export const detectScoringMode = (game?: Partial<Game> | null): ScoringMode => {
  if (!game) return 'CLASSIC';
  if (game.scoringMode) return game.scoringMode as ScoringMode;
  const preset = detectScoringPreset(game);
  if (preset) return scoringModeFromPreset(preset);
  if (game.ballsInGames) return 'CLASSIC';
  if ((game.maxTotalPointsPerSet ?? 0) > 0) return 'POINTS';
  return 'CLASSIC';
};

/** Custom points target when stored only as maxTotalPointsPerSet (no matching preset). */
export function detectInitialCustomPointsTotal(game?: Partial<Game> | null): number | null {
  if (game && !game.scoringPreset && detectScoringMode(game) === 'POINTS') {
    const pts = game.maxTotalPointsPerSet ?? 0;
    if (pts > 0) {
      const detected = detectScoringPreset(game);
      if (!detected || (getScoringPresetConfig(detected).maxTotalPointsPerSet ?? 0) !== pts) {
        return pts;
      }
    }
  }
  return null;
}
