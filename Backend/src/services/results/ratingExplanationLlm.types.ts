export type LlmRatingExplanationStatus = 'pending' | 'ready' | 'failed' | 'skipped' | 'unavailable';

export type StoredLlmRatingExplanation = {
  status: 'pending' | 'ready' | 'failed';
  language: string;
  text?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
};

export type StoredLlmRatingTranslation = {
  status: 'pending' | 'ready' | 'failed';
  language: string;
  text?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
};

/** Canonical v2 blob on GameOutcome.metadata.llmRatingExplanation */
export type LlmRatingExplanationBlob = {
  version: 2;
  source: StoredLlmRatingExplanation;
  translations: Record<string, StoredLlmRatingTranslation>;
};

export type RatingExplanationLlmResponse = {
  status: LlmRatingExplanationStatus;
  text?: string;
  /** Language of the returned text. */
  language?: string;
  /** Language the original insight was written in. */
  sourceLanguage?: string;
  kind?: 'original' | 'translation';
};

/** Slim payload sent to the LLM (derived from outcome explanation). */
export type ExplanationDataForLlm = {
  levelBefore: number;
  levelAfter: number;
  levelChange: number;
  reliabilityBefore: number;
  reliabilityAfter: number;
  reliabilityChange: number;
  reliabilityCoefficient: number;
  ratingSettling: boolean;
  ratingUncertainty?: number;
  gamesPlayedBefore: number;
  summary: {
    totalMatches: number;
    wins: number;
    losses: number;
    draws: number;
    averageOpponentLevel: number;
  };
  placementRatingFloor?: {
    applied: boolean;
    uncappedLevelChange: number;
  };
  matches: Array<{
    roundNumber: number;
    matchNumber: number;
    isWinner: boolean;
    isDraw: boolean;
    notFinishedByRules?: boolean;
    opponentLevel: number;
    levelDifference: number;
    scoreDelta?: number;
    levelChange: number;
    pointsEarned: number;
    multiplier?: number;
    totalPointDifferential?: number;
    enduranceCoefficient?: number;
    teammates: Array<{ name: string; level: number }>;
    opponents: Array<{ name: string; level: number }>;
    sets?: Array<{
      setNumber: number;
      isWinner: boolean;
      levelChange: number;
      userScore: number;
      opponentScore: number;
      isTieBreak?: boolean;
      scoreKind?: string;
    }>;
  }>;
};
