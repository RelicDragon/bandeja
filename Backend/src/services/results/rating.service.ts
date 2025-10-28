interface PlayerStats {
  level: number;
  reliability: number;
  gamesPlayed: number;
}

interface MatchResult {
  isWinner: boolean;
  scoreDelta?: number;
  opponentsLevel: number;
}

interface RatingUpdate {
  levelBefore: number;
  levelAfter: number;
  levelChange: number;
  reliabilityBefore: number;
  reliabilityAfter: number;
  reliabilityChange: number;
  pointsEarned: number;
}

const BASE_LEVEL_CHANGE = 0.05;
const MAX_LEVEL_CHANGE = 0.3;
const RELIABILITY_INCREMENT = 0.1;
const POINTS_PER_WIN = 10;

export function calculateRatingUpdate(
  playerStats: PlayerStats,
  matchResult: MatchResult
): RatingUpdate {
  const levelBefore = playerStats.level;
  const reliabilityBefore = playerStats.reliability;

  const levelDifference = matchResult.opponentsLevel - levelBefore;
  
  let levelChange: number;
  if (matchResult.isWinner) {
    levelChange = Math.min(
      BASE_LEVEL_CHANGE * (1 + levelDifference / 10),
      MAX_LEVEL_CHANGE
    );
  } else {
    levelChange = Math.max(
      -BASE_LEVEL_CHANGE * (1 - levelDifference / 10),
      -MAX_LEVEL_CHANGE
    );
  }

  if (matchResult.scoreDelta !== undefined) {
    levelChange *= (1 + matchResult.scoreDelta / 100);
  }

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

