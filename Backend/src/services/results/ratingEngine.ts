import type { Sport } from '../../sport/sportIds';
import { getSportConfig } from '../../sport/sportRegistry';

export type RatingEngineConfig = {
  maxDeltaPerEvent: number;
  useScoreMargin: boolean;
  ballsInGamesMargin: boolean;
};

const DEFAULT_ENGINE: RatingEngineConfig = {
  maxDeltaPerEvent: 0.2,
  useScoreMargin: true,
  ballsInGamesMargin: false,
};

export function resolveRatingEngine(sport: Sport): RatingEngineConfig {
  const { engine } = getSportConfig(sport).ratingModel;
  return {
    maxDeltaPerEvent: engine.maxDeltaPerEvent ?? DEFAULT_ENGINE.maxDeltaPerEvent,
    useScoreMargin: engine.useScoreMargin,
    ballsInGamesMargin: engine.ballsInGamesMargin ?? DEFAULT_ENGINE.ballsInGamesMargin,
  };
}
