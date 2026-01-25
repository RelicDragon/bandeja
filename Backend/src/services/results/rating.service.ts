interface PlayerStats {
  level: number;
  reliability: number;
  gamesPlayed: number;
}

interface MatchResult {
  isWinner: boolean;
  isDraw?: boolean;
  scoreDelta?: number;
  opponentsLevel: number;
  setScores?: Array<{ teamAScore: number; teamBScore: number; isTieBreak?: boolean }>;
}

interface RatingUpdate {
  levelChange: number;
  pointsEarned: number;
  multiplier?: number;
  totalPointDifferential?: number;
  enduranceCoefficient?: number;
  reliabilityCoefficient?: number;
}

const BASE_LEVEL_CHANGE = 0.05;
const MAX_LEVEL_CHANGE = 0.3;
export const RELIABILITY_INCREMENT = 0.1;
const POINTS_PER_WIN = 10;

const MIN_MULTIPLIER = 0.3;
const MAX_MULTIPLIER = 3.0;
const CLOSE_MATCH_THRESHOLD = 3;
const BLOWOUT_THRESHOLD = 15;

const ELO_SCALING_FACTOR = 1.7;
const HIGH_LEVEL_THRESHOLD = 5.0;
const MAX_ACHIEVABLE_LEVEL = 6.8;

export function calculateEnduranceCoefficient(
  setScores: Array<{ teamAScore: number; teamBScore: number; isTieBreak?: boolean }> | undefined,
  ballsInGames: boolean
): number {
  if (!setScores || setScores.length === 0) {
    return 1;
  }

  const sum = setScores.reduce((total, set) => {
    const setTotal = set.teamAScore + set.teamBScore;
    const effectiveBallsInGames = ballsInGames && !set.isTieBreak;
    return total + (effectiveBallsInGames ? setTotal * 5 : setTotal);
  }, 0);
  
  let coefficient = sum / 20;
  
  return coefficient;
}

export function calculateReliabilityChange(
  setScores: Array<{ teamAScore: number; teamBScore: number; isTieBreak?: boolean }> | undefined,
  ballsInGames: boolean
): number {
  if (!setScores || setScores.length === 0) {
    return 0;
  }

  const sum = setScores.reduce((total, set) => {
    const setTotal = set.teamAScore + set.teamBScore;
    const effectiveBallsInGames = ballsInGames && !set.isTieBreak;
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

function calculateDifferentialMultiplier(setScores: Array<{ teamAScore: number; teamBScore: number }>): { multiplier: number; totalPointDifferential: number } {
  let totalPointDifferential = 0;
  
  const validSets = setScores.filter(set => set.teamAScore > 0 || set.teamBScore > 0);
  for (const set of validSets) {
    const diff = set.teamAScore - set.teamBScore;
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
  ballsInGames: boolean = false
): RatingUpdate {
  const expectedWinProbability = calculateExpectedWinProbability(playerStats.level, matchResult.opponentsLevel);
  
  let actualScore: number;
  if (matchResult.isDraw) {
    actualScore = 0.5;
  } else if (matchResult.isWinner) {
    actualScore = 1.0;
  } else {
    actualScore = 0.0;
  }

  const performanceDifference = actualScore - expectedWinProbability;
  
  const K_FACTOR = 10.0;
  let baseLevelChange = K_FACTOR * BASE_LEVEL_CHANGE * performanceDifference;

  let multiplier = 1.0;
  let totalPointDifferential: number | undefined = undefined;

  if (matchResult.setScores && matchResult.setScores.length > 0) {
    const result = calculateDifferentialMultiplier(matchResult.setScores);
    multiplier = result.multiplier;
    totalPointDifferential = result.totalPointDifferential;
  }

  let levelChange = baseLevelChange * multiplier;

  const enduranceCoefficient = calculateEnduranceCoefficient(matchResult.setScores, ballsInGames);
  levelChange = levelChange * enduranceCoefficient;

  const clampedReliability = Math.max(0.0, Math.min(100.0, playerStats.reliability));
  const reliabilityCoefficient = Math.max(0.05, Math.exp(-0.15 * Math.pow(clampedReliability, 0.68)));
  levelChange = levelChange * reliabilityCoefficient;

  const highLevelDampening = calculateHighLevelDampening(playerStats.level, levelChange > 0);
  levelChange = levelChange * highLevelDampening;

  levelChange = Math.max(-MAX_LEVEL_CHANGE, Math.min(MAX_LEVEL_CHANGE, levelChange));

  const pointsEarned = matchResult.isWinner ? POINTS_PER_WIN : 0;

  return {
    levelChange,
    pointsEarned,
    multiplier,
    totalPointDifferential,
    enduranceCoefficient,
    reliabilityCoefficient,
  };
}

