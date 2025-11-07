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
  levelBefore: number;
  levelAfter: number;
  levelChange: number;
  reliabilityBefore: number;
  reliabilityAfter: number;
  reliabilityChange: number;
  pointsEarned: number;
  multiplier?: number;
  totalPointDifferential?: number;
}

const BASE_LEVEL_CHANGE = 0.05;
const MAX_LEVEL_CHANGE = 0.3;
const RELIABILITY_INCREMENT = 0.1;
const POINTS_PER_WIN = 10;

const MIN_MULTIPLIER = 0.3;
const MAX_MULTIPLIER = 3.0;
const CLOSE_MATCH_THRESHOLD = 3;
const BLOWOUT_THRESHOLD = 15;

function calculateDifferentialMultiplier(setScores: Array<{ teamAScore: number; teamBScore: number }>): { multiplier: number; totalPointDifferential: number } {
  let totalPointDifferential = 0;
  
  for (const set of setScores) {
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
  matchResult: MatchResult
): RatingUpdate {
  const levelBefore = playerStats.level;
  const reliabilityBefore = playerStats.reliability;

  const levelDifference = matchResult.opponentsLevel - levelBefore;
  
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

  levelChange = Math.max(-MAX_LEVEL_CHANGE, Math.min(MAX_LEVEL_CHANGE, levelChange));

  const levelAfter = Math.max(0.1, levelBefore + levelChange);

  const reliabilityChange = RELIABILITY_INCREMENT;
  const reliabilityAfter = reliabilityBefore + reliabilityChange;

  const pointsEarned = matchResult.isWinner ? POINTS_PER_WIN : 0;

  return {
    levelBefore,
    levelAfter,
    levelChange,
    reliabilityBefore,
    reliabilityAfter,
    reliabilityChange,
    pointsEarned,
    multiplier,
    totalPointDifferential,
  };
}

export function calculateAmericanoRating(
  playerStats: PlayerStats,
  scoreDelta: number,
  avgOpponentLevel: number
): RatingUpdate {
  const levelBefore = playerStats.level;
  const reliabilityBefore = playerStats.reliability;

  const normalizedDelta = scoreDelta / 100;
  const levelDifference = avgOpponentLevel - levelBefore;
  
  const levelChange = Math.max(
    -MAX_LEVEL_CHANGE,
    Math.min(
      MAX_LEVEL_CHANGE,
      BASE_LEVEL_CHANGE * normalizedDelta * (1 + levelDifference / 20)
    )
  );

  const levelAfter = Math.max(0.1, levelBefore + levelChange);

  const reliabilityChange = RELIABILITY_INCREMENT;
  const reliabilityAfter = reliabilityBefore + reliabilityChange;

  const pointsEarned = Math.max(0, Math.round(scoreDelta / 5));

  return {
    levelBefore,
    levelAfter,
    levelChange,
    reliabilityBefore,
    reliabilityAfter,
    reliabilityChange,
    pointsEarned,
  };
}

