export enum PlayerLevel {
  INITIATION = 'Initiation',
  BEGINNER = 'Beginner',
  INITIATION_INTERMEDIATE = 'Initiation Intermediate',
  INTERMEDIATE = 'Intermediate',
  INTERMEDIATE_HIGH = 'Intermediate High',
  INTERMEDIATE_ADVANCED = 'Intermediate Advanced',
  COMPETITION = 'Competition',
  PROFESSIONAL = 'Professional',
}

export interface LevelRange {
  min: number;
  max: number;
  name: PlayerLevel;
}

export const LEVEL_RANGES: LevelRange[] = [
  { min: 0, max: 0.99, name: PlayerLevel.INITIATION },
  { min: 1.0, max: 1.49, name: PlayerLevel.BEGINNER },
  { min: 1.5, max: 2.4, name: PlayerLevel.INITIATION_INTERMEDIATE },
  { min: 2.5, max: 3.4, name: PlayerLevel.INTERMEDIATE },
  { min: 3.5, max: 4.4, name: PlayerLevel.INTERMEDIATE_HIGH },
  { min: 4.5, max: 5.4, name: PlayerLevel.INTERMEDIATE_ADVANCED },
  { min: 5.5, max: 5.6, name: PlayerLevel.COMPETITION },
  { min: 5.7, max: 7.0, name: PlayerLevel.PROFESSIONAL },
];

export const POINTS = {
  PLAY: 10,
  WIN: 100,
  SET_WON: 25,
  HIGHER_RANK_BONUS: 50,
};

export interface PlayerStats {
  level: number;
  reliability: number;
  gamesPlayed: number;
}

export interface MatchResult {
  isWinner: boolean;
  setsWon: number;
  setsLost: number;
  opponentsLevel: number;
}

export interface RatingUpdate {
  levelBefore: number;
  levelAfter: number;
  levelChange: number;
  reliabilityBefore: number;
  reliabilityAfter: number;
  pointsEarned: number;
}

export function getLevelName(level: number): PlayerLevel {
  const range = LEVEL_RANGES.find((r) => level >= r.min && level <= r.max);
  return range ? range.name : PlayerLevel.BEGINNER;
}

export function calculateReliability(gamesPlayed: number): number {
  if (gamesPlayed === 0) return 0;
  if (gamesPlayed >= 50) return 100;
  return Math.min(100, (gamesPlayed / 50) * 100);
}

export function calculateLevelChange(
  currentLevel: number,
  reliability: number,
  isWinner: boolean,
  opponentLevel: number,
  setsWon: number,
  setsLost: number
): number {
  const baseChange = 0.02;
  const reliabilityFactor = 1 - reliability / 100;
  const levelDifference = opponentLevel - currentLevel;
  
  let change = baseChange * reliabilityFactor;

  if (isWinner) {
    change *= 1 + Math.max(0, levelDifference * 0.5);
  } else {
    change *= -(1 + Math.max(0, -levelDifference * 0.5));
  }

  const setsDifference = setsWon - setsLost;
  change *= 1 + setsDifference * 0.1;

  const maxChange = 0.2;
  change = Math.max(-maxChange, Math.min(maxChange, change));

  const newLevel = currentLevel + change;
  return Math.max(0, Math.min(7, newLevel)) - currentLevel;
}

export function calculatePoints(
  isWinner: boolean,
  setsWon: number,
  currentLevel: number,
  opponentLevel: number
): number {
  let points = POINTS.PLAY;

  if (isWinner) {
    points += POINTS.WIN;
  }

  points += setsWon * POINTS.SET_WON;

  if (isWinner && opponentLevel > currentLevel) {
    points += POINTS.HIGHER_RANK_BONUS;
  }

  return points;
}

export function calculateRatingUpdate(
  playerStats: PlayerStats,
  matchResult: MatchResult
): RatingUpdate {
  const { level, reliability, gamesPlayed } = playerStats;
  const { isWinner, setsWon, setsLost, opponentsLevel } = matchResult;

  const reliabilityBefore = reliability;
  const reliabilityAfter = calculateReliability(gamesPlayed + 1);

  const levelChange = calculateLevelChange(
    level,
    reliability,
    isWinner,
    opponentsLevel,
    setsWon,
    setsLost
  );

  const levelBefore = level;
  const levelAfter = level + levelChange;

  const pointsEarned = calculatePoints(isWinner, setsWon, level, opponentsLevel);

  return {
    levelBefore,
    levelAfter,
    levelChange,
    reliabilityBefore,
    reliabilityAfter,
    pointsEarned,
  };
}

