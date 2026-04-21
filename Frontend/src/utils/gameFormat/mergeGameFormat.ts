import { GameType, GameSetupParams, MatchGenerationType, ScoringMode, ScoringPreset } from '@/types';
import scoringPresetsData from '@/config/scoringPresets.json';
import { deriveGameType, DEFAULT_GENERATION_BY_MODE, DEFAULT_PRESET_BY_MODE } from './scoringCompatibility';
import { getGameTypeTemplate } from '@/utils/gameTypeTemplates';
import { deriveBallsInGamesFromScoring } from './deriveBallsInGames';

export interface GameFormatState {
  scoringMode: ScoringMode;
  scoringPreset: ScoringPreset;
  generationType: MatchGenerationType;
  hasGoldenPoint: boolean;
  pointsPerWin: number;
  pointsPerLoose: number;
  pointsPerTie: number;
  winnerOfGame: GameSetupParams['winnerOfGame'];
  prohibitMatchesEditing: boolean;
  /** When set, overrides preset-based scoring with a custom points total. */
  customPointsTotal: number | null;
  /** 1–60 when timed preset is selected; ignored otherwise. */
  matchTimedCapMinutes: number;
  overrides?: Partial<GameSetupParams>;
}

type ScoringPresetConfig = Partial<Pick<GameSetupParams, 'winnerOfMatch' | 'fixedNumberOfSets' | 'maxTotalPointsPerSet' | 'maxPointsPerTeam'>>;

const scoringPresets = scoringPresetsData as Record<ScoringPreset, ScoringPresetConfig>;

export const getScoringPresetConfig = (preset: ScoringPreset): ScoringPresetConfig =>
  scoringPresets[preset] ?? {};

export const buildSetupFromFormat = (state: GameFormatState): GameSetupParams => {
  const gameType: GameType = deriveGameType(state.scoringMode, state.generationType);
  const template = getGameTypeTemplate(gameType);

  const useCustomPoints = state.scoringMode === 'POINTS' && state.customPointsTotal != null;
  const scoring = getScoringPresetConfig(state.scoringPreset);
  const isTimedPreset = state.scoringPreset === 'TIMED' || state.scoringPreset === 'CLASSIC_TIMED';
  const capMinutes = isTimedPreset
    ? Math.min(60, Math.max(1, state.matchTimedCapMinutes || 15))
    : 0;

  const goldenAllowed = state.scoringMode === 'CLASSIC';
  const effectiveGolden =
    goldenAllowed && ((state.overrides?.hasGoldenPoint ?? state.hasGoldenPoint) ?? false);

  const base: Omit<GameSetupParams, 'ballsInGames'> = {
    winnerOfMatch: scoring.winnerOfMatch ?? template.winnerOfMatch,
    winnerOfGame: state.winnerOfGame ?? template.winnerOfGame,
    matchGenerationType: state.generationType ?? template.matchGenerationType,
    fixedNumberOfSets: scoring.fixedNumberOfSets ?? template.fixedNumberOfSets ?? 0,
    maxTotalPointsPerSet: useCustomPoints ? state.customPointsTotal! : (scoring.maxTotalPointsPerSet ?? 0),
    matchTimedCapMinutes: capMinutes,
    maxPointsPerTeam: 0,
    pointsPerWin: state.pointsPerWin ?? template.pointsPerWin ?? 0,
    pointsPerLoose: state.pointsPerLoose ?? template.pointsPerLoose ?? 0,
    pointsPerTie: state.pointsPerTie ?? template.pointsPerTie ?? 0,
    prohibitMatchesEditing: state.prohibitMatchesEditing ?? false,
    scoringPreset: useCustomPoints ? null : state.scoringPreset,
    hasGoldenPoint: effectiveGolden,
  };

  const restOverrides = { ...(state.overrides ?? {}) };
  delete (restOverrides as Partial<GameSetupParams>).ballsInGames;

  const merged: Omit<GameSetupParams, 'ballsInGames'> = {
    ...base,
    ...restOverrides,
    scoringPreset: useCustomPoints ? null : state.scoringPreset,
    hasGoldenPoint: effectiveGolden,
  };
  return {
    ...merged,
    ballsInGames: deriveBallsInGamesFromScoring({
      scoringPreset: merged.scoringPreset as string | null,
      winnerOfMatch: merged.winnerOfMatch,
      maxTotalPointsPerSet: merged.maxTotalPointsPerSet,
    }),
  };
};

export const defaultPresetForMode = (mode: ScoringMode): ScoringPreset =>
  DEFAULT_PRESET_BY_MODE[mode];

export const defaultGenerationForMode = (mode: ScoringMode): MatchGenerationType =>
  DEFAULT_GENERATION_BY_MODE[mode];
