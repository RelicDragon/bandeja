import { EntityType } from '@prisma/client';
import type { SportRatingModel } from '../../shared/createTemplates';
import {
  ratingSetUsesGamesMargin,
  ratingSetUsesTiebreakMargin,
  type RatingSetScore,
} from '@bandeja/shared/automaticRelaxedScoring';
import { computeReliabilityCoefficient } from './ratingUncertainty';

interface PlayerStats {
  level: number;
  reliability: number;
  gamesPlayed: number;
  ratingUncertainty?: number;
}

interface MatchResult {
  isWinner: boolean;
  isDraw?: boolean;
  scoreDelta?: number;
  ownTeamLevel: number;
  opponentsLevel: number;
  setScores?: RatingSetScore[];
}

interface RatingUpdate {
  levelChange: number;
  pointsEarned: number;
  multiplier?: number;
  totalPointDifferential?: number;
  enduranceCoefficient?: number;
  reliabilityCoefficient?: number;
  /** Pre-margin Elo-style delta from expected vs actual outcome. */
  expectedWinProbability: number;
  performanceDifference: number;
  baseLevelChange: number;
  highLevelDampening: number;
  cappedByMaxDelta: boolean;
  maxDeltaPerEvent: number;
  ownTeamLevel: number;
  opponentsLevel: number;
  /** Score-margin bucket before level-gap expectedness scaling. */
  marginLabel?: 'veryClose' | 'close' | 'normal' | 'blowout';
}

export type RatingMarginLabel = NonNullable<RatingUpdate['marginLabel']>;

function marginLabelFromRawMultiplier(rawMultiplier: number): RatingMarginLabel {
  if (rawMultiplier < 0.6) return 'veryClose';
  if (rawMultiplier < 1) return 'close';
  if (rawMultiplier > 2) return 'blowout';
  return 'normal';
}

const BASE_LEVEL_CHANGE = 0.05;
const DEFAULT_MAX_LEVEL_CHANGE = 0.2;
export const RELIABILITY_INCREMENT = 0.1;
const POINTS_PER_WIN = 10;

const MIN_MULTIPLIER = 0.3;
const MAX_MULTIPLIER = 2.0;
const CLOSE_MATCH_THRESHOLD = 3;
const BLOWOUT_THRESHOLD = 15;

const ELO_SCALING_FACTOR = 0.8;
const HIGH_LEVEL_THRESHOLD = 5.0;
const MAX_ACHIEVABLE_LEVEL = 6.8;

function enduranceEntityTypeMultiplier(
  entityType?: EntityType,
  isGainingRating = false,
): number {
  if (entityType === EntityType.LEAGUE) return isGainingRating ? 3 : 1;
  if (entityType === EntityType.TOURNAMENT) return 2;
  return 1;
}

export function calculateEnduranceCoefficient(
  setScores: RatingSetScore[] | undefined,
  ballsInGames: boolean,
  entityType?: EntityType,
  isGainingRating = false,
): number {
  const usesGamesEndurance =
    !setScores || setScores.length === 0
      ? ballsInGames
      : setScores.some((set) => ratingSetUsesGamesMargin(set, ballsInGames));
  const base =
    !setScores || setScores.length === 0
      ? usesGamesEndurance ? 0.25 : 0.5
      : usesGamesEndurance ? 0.25 : 0.1;

  const setCountMultiplier =
    setScores && setScores.length > 0 ? setScores.length : 1;

  return (
    base *
    enduranceEntityTypeMultiplier(entityType, isGainingRating) *
    setCountMultiplier
  );
}

export function calculateReliabilityChange(
  setScores: RatingSetScore[] | undefined,
  ballsInGames: boolean
): number {
  if (!setScores || setScores.length === 0) {
    return 0;
  }

  const sum = setScores.reduce((total, set) => {
    const setTotal = set.teamAScore + set.teamBScore;
    const effectiveBallsInGames = ratingSetUsesGamesMargin(set, ballsInGames);
    return total + (effectiveBallsInGames ? setTotal * 5 : setTotal);
  }, 0);
  
  const reliabilityChange = sum / 150;
  
  return reliabilityChange;
}

function calculateExpectedWinProbability(playerLevel: number, opponentLevel: number): number {
  const levelDifference = opponentLevel - playerLevel;
  return 1 / (1 + Math.pow(10, levelDifference / ELO_SCALING_FACTOR));
}

function calculateHighLevelDampening(playerLevel: number, isGaining: boolean): number {
  if (!isGaining || playerLevel < HIGH_LEVEL_THRESHOLD) {
    return 1.0;
  }
  
  const progressAboveThreshold = playerLevel - HIGH_LEVEL_THRESHOLD;
  const maxProgress = MAX_ACHIEVABLE_LEVEL - HIGH_LEVEL_THRESHOLD;
  const ratio = Math.min(1.0, progressAboveThreshold / maxProgress);
  
  return Math.exp(-3.5 * ratio);
}

function calculateDifferentialMultiplier(setScores: RatingSetScore[]): { multiplier: number; totalPointDifferential: number } {
  let totalPointDifferential = 0;

  const validSets = setScores.filter(set => set.teamAScore > 0 || set.teamBScore > 0);
  for (const set of validSets) {
    const diff = ratingSetUsesTiebreakMargin(set)
      ? (set.teamAScore > set.teamBScore ? 1 : set.teamBScore > set.teamAScore ? -1 : 0)
      : set.teamAScore - set.teamBScore;
    totalPointDifferential += diff;
  }

  if (totalPointDifferential <= CLOSE_MATCH_THRESHOLD && totalPointDifferential >= -CLOSE_MATCH_THRESHOLD) {
    const ratio = Math.abs(totalPointDifferential) / CLOSE_MATCH_THRESHOLD;
    const multiplier = MIN_MULTIPLIER + (1.0 - MIN_MULTIPLIER) * ratio;
    return { multiplier, totalPointDifferential };
  }

  if (Math.abs(totalPointDifferential) >= BLOWOUT_THRESHOLD) {
    return { multiplier: MAX_MULTIPLIER, totalPointDifferential };
  }

  const range = BLOWOUT_THRESHOLD - CLOSE_MATCH_THRESHOLD;
  const position = Math.abs(totalPointDifferential) - CLOSE_MATCH_THRESHOLD;
  const ratio = position / range;
  const multiplier = 1.0 + (MAX_MULTIPLIER - 1.0) * ratio;

  return { multiplier, totalPointDifferential };
}

export function calculateRatingUpdate(
  playerStats: PlayerStats,
  matchResult: MatchResult,
  ballsInGames: boolean = false,
  engine: SportRatingModel['engine'] = {
    maxDeltaPerEvent: DEFAULT_MAX_LEVEL_CHANGE,
    useScoreMargin: true,
    ballsInGamesMargin: false,
  },
  entityType?: EntityType,
): RatingUpdate {
  const maxLevelChange = engine.maxDeltaPerEvent ?? DEFAULT_MAX_LEVEL_CHANGE;
  const marginBallsInGames = ballsInGames && (engine.ballsInGamesMargin ?? false);
  const expectedWinProbability = calculateExpectedWinProbability(
    matchResult.ownTeamLevel,
    matchResult.opponentsLevel
  );
  
  let actualScore: number;
  if (matchResult.isDraw) {
    actualScore = 0.5;
  } else if (matchResult.isWinner) {
    actualScore = 1.0;
  } else {
    actualScore = 0.0;
  }

  const performanceDifference = actualScore - expectedWinProbability;
  
  const K_FACTOR = 15.0;
  let baseLevelChange = K_FACTOR * BASE_LEVEL_CHANGE * performanceDifference;

  let multiplier = 1.0;
  let totalPointDifferential: number | undefined = undefined;
  let marginLabel: RatingMarginLabel | undefined;

  if (
    engine.useScoreMargin &&
    matchResult.setScores &&
    matchResult.setScores.length > 0
  ) {
    const result = calculateDifferentialMultiplier(matchResult.setScores);
    totalPointDifferential = result.totalPointDifferential;
    marginLabel = marginLabelFromRawMultiplier(result.multiplier);

    const levelGap = Math.abs(matchResult.ownTeamLevel - matchResult.opponentsLevel);
    const expectednessScale = 1 / (1 + levelGap);
    multiplier = 1.0 + (result.multiplier - 1.0) * expectednessScale;
  }

  let levelChange = baseLevelChange * multiplier;

  const enduranceCoefficient = calculateEnduranceCoefficient(
    matchResult.setScores,
    marginBallsInGames,
    entityType,
    levelChange > 0,
  );
  levelChange = levelChange * enduranceCoefficient;

  const reliabilityCoefficient = computeReliabilityCoefficient(
    playerStats.reliability,
    playerStats.ratingUncertainty ?? 0,
  );
  levelChange = levelChange * reliabilityCoefficient;

  const highLevelDampening = calculateHighLevelDampening(playerStats.level, levelChange > 0);
  levelChange = levelChange * highLevelDampening;

  const uncappedLevelChange = levelChange;
  levelChange = Math.max(-maxLevelChange, Math.min(maxLevelChange, levelChange));
  const cappedByMaxDelta = Math.abs(uncappedLevelChange) > maxLevelChange + 1e-12;

  const pointsEarned = matchResult.isWinner ? POINTS_PER_WIN : 0;

  return {
    levelChange,
    pointsEarned,
    multiplier,
    totalPointDifferential,
    enduranceCoefficient,
    reliabilityCoefficient,
    expectedWinProbability,
    performanceDifference,
    baseLevelChange,
    highLevelDampening,
    cappedByMaxDelta,
    maxDeltaPerEvent: maxLevelChange,
    ownTeamLevel: matchResult.ownTeamLevel,
    opponentsLevel: matchResult.opponentsLevel,
    marginLabel,
  };
}

