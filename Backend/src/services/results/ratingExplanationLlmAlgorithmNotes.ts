import { ratingUncertaintyScale } from './ratingUncertainty';
import type { ExplanationDataForLlm } from './ratingExplanationLlm.types';

type MatchForNotes = ExplanationDataForLlm['matches'][number];

const ALGORITHM_FIELD_GUIDE = {
  expectedWinProbability:
    '0–1 chance of winning from team level gap before the match (Elo-style). Near 1 = expected win; near 0 = upset.',
  performanceDifference:
    'Actual outcome (1 win / 0.5 draw / 0 loss) minus expectedWinProbability. Positive = outperformed expectation.',
  baseLevelChange:
    'Level delta from performanceDifference alone, before score-margin, endurance, reliability, high-level dampening, and cap.',
  marginLabel:
    'Score-margin bucket from point differential: veryClose | close | normal | blowout (before level-gap expectedness scaling).',
  multiplier:
    'Applied score-margin factor after expectedness scaling (close upsets matter more than blowouts vs much weaker sides).',
  enduranceCoefficient:
    'Scales by set count / games-vs-points / entity type (league/tournament).',
  reliabilityCoefficient:
    'Scales level-move size from how settled the rating is (and idle uncertainty). Not a separate outcome to explain.',
  highLevelDampening:
    'Reduces gains for players above high-level threshold (~5.0). 1 = none.',
  cappedByMaxDelta:
    'True if this match hit maxDeltaPerEvent (±cap) after all other multipliers.',
  placementRatingFloor:
    'If applied, negative session level change was floored (often to 0); uncappedLevelChange is what it would have been.',
} as const;

export function buildAlgorithmNotes(
  explanation: {
    ratingUncertainty: number;
    ratingSettling: boolean;
    reliabilityCoefficient: number;
    placementRatingFloor?: ExplanationDataForLlm['placementRatingFloor'];
    matches: Array<{
      maxDeltaPerEvent?: number;
      highLevelDampening?: number;
      cappedByMaxDelta?: boolean;
      expectedWinProbability?: number;
      performanceDifference?: number;
      baseLevelChange?: number;
      marginLabel?: MatchForNotes['marginLabel'];
      ownTeamLevel?: number;
    }>;
  },
): ExplanationDataForLlm['algorithmNotes'] {
  const ratedMatches = explanation.matches.filter(
    (m) => m.expectedWinProbability != null && m.baseLevelChange != null,
  );
  const maxDeltaPerEvent = ratedMatches.find((m) => m.maxDeltaPerEvent != null)?.maxDeltaPerEvent;
  const anyHighLevelDampening = ratedMatches.some(
    (m) => m.highLevelDampening != null && m.highLevelDampening < 1 - 1e-12,
  );
  const anyCapped = ratedMatches.some((m) => m.cappedByMaxDelta);

  return {
    fieldGuide: ALGORITHM_FIELD_GUIDE,
    ratingUncertaintyScale:
      explanation.ratingUncertainty > 0
        ? ratingUncertaintyScale(explanation.ratingUncertainty)
        : undefined,
    ratingSettling: explanation.ratingSettling,
    reliabilityCoefficient: explanation.reliabilityCoefficient,
    maxDeltaPerEvent,
    highLevelDampeningApplied: anyHighLevelDampening || undefined,
    anyMatchCappedByMaxDelta: anyCapped || undefined,
    placementRatingFloor: explanation.placementRatingFloor,
  };
}
