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
  /** How settled the player's rating was going into this game (affects level-move size). */
  reliabilityBefore: number;
  /** Scales how large the level change is; do not treat as a separate outcome to explain. */
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
  /** Named rating-engine levers + short field guide for fair level-magnitude narration. */
  algorithmNotes: {
    fieldGuide: Record<string, string>;
    ratingUncertaintyScale?: number;
    ratingSettling: boolean;
    reliabilityCoefficient: number;
    maxDeltaPerEvent?: number;
    highLevelDampeningApplied?: boolean;
    anyMatchCappedByMaxDelta?: boolean;
    placementRatingFloor?: {
      applied: boolean;
      uncappedLevelChange: number;
    };
  };
  matches: Array<{
    roundNumber: number;
    matchNumber: number;
    isWinner: boolean;
    isDraw: boolean;
    notFinishedByRules?: boolean;
    opponentLevel: number;
    ownTeamLevel?: number;
    levelDifference: number;
    scoreDelta?: number;
    levelChange: number;
    pointsEarned: number;
    multiplier?: number;
    totalPointDifferential?: number;
    enduranceCoefficient?: number;
    expectedWinProbability?: number;
    performanceDifference?: number;
    baseLevelChange?: number;
    highLevelDampening?: number;
    cappedByMaxDelta?: boolean;
    maxDeltaPerEvent?: number;
    marginLabel?: 'veryClose' | 'close' | 'normal' | 'blowout';
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
