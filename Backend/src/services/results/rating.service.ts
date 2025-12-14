import prisma from '../../config/database';
import { Prisma } from '@prisma/client';

interface PlayerStats {
  level: number;
  reliability: number;
  gamesPlayed: number;
}

interface MatchResult {
  isWinner: boolean;
  scoreDelta?: number;
  opponentsLevel: number;
  setScores?: Array<{ teamAScore: number; teamBScore: number }>;
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

export function calculateEnduranceCoefficient(
  setScores: Array<{ teamAScore: number; teamBScore: number }> | undefined,
  ballsInGames: boolean
): number {
  if (!setScores || setScores.length === 0) {
    return 1;
  }

  const sum = setScores.reduce((total, set) => total + set.teamAScore + set.teamBScore, 0);
  
  let coefficient = sum / 20;
  
  if (ballsInGames) {
    coefficient *= 5;
  }
  
  return coefficient;
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
  const levelDifference = matchResult.opponentsLevel - playerStats.level;
  
  let baseLevelChange: number;
  if (matchResult.isWinner) {
    baseLevelChange = Math.min(
      BASE_LEVEL_CHANGE * (1 + levelDifference / 10),
      MAX_LEVEL_CHANGE
    );
  } else {
    baseLevelChange = Math.max(
      -BASE_LEVEL_CHANGE * (1 - levelDifference / 10),
      -MAX_LEVEL_CHANGE
    );
  }

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
  const reliabilityCoefficient = Math.pow(0.95, clampedReliability);
  levelChange = levelChange * reliabilityCoefficient;

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

export async function calculateAndUpdateUserReliability(
  userId: string,
  tx?: Prisma.TransactionClient
): Promise<number> {
  const prismaClient = tx || prisma;

  const gameOutcomes = await prismaClient.gameOutcome.aggregate({
    where: { userId },
    _sum: {
      wins: true,
      ties: true,
      losses: true,
    },
  });

  const matchesCount = (gameOutcomes._sum.wins || 0) + 
                       (gameOutcomes._sum.ties || 0) + 
                       (gameOutcomes._sum.losses || 0);

  const lundaEventsCount = await prismaClient.levelChangeEvent.count({
    where: {
      userId,
      eventType: 'LUNDA',
    },
  });

  const reliability = (matchesCount * RELIABILITY_INCREMENT) + 
                      (lundaEventsCount * RELIABILITY_INCREMENT * 8);
  
  const clampedReliability = Math.max(0.0, Math.min(100.0, reliability));

  await prismaClient.user.update({
    where: { id: userId },
    data: { reliability: clampedReliability },
  });

  return clampedReliability;
}

