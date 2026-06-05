import type { GameType, MatchGenerationType, ScoringPreset } from '@/types';
import type { Sport } from '@shared/sport';
import type { CreateTemplate } from '@/sport/createFlow';
import { resolveCreateTemplateGeneration } from '@/utils/gameFormat/createTemplateGeneration';
import {
  applyLevelToMatchMinutes,
  resolveEffectivePlayLevel,
} from './levelDurationScale';
import { resolveMatchMinutes, roundGapMinutesForPreset } from './durationProfiles';
import { formatEventDurationLabel, roundDisplayMinutes } from './formatEventDurationLabel';
import { MAX_EVENT_COURTS } from './suggestCourtCount';

const ROTATION_GENERATIONS = new Set<MatchGenerationType>([
  'RANDOM',
  'RATING',
  'WINNERS_COURT',
  'ESCALERA',
  'KING_OF_COURT',
  'ROUND_ROBIN',
]);

export type EventDurationEstimateInput = {
  sport: Sport;
  maxParticipants: number;
  playersPerMatch: 2 | 4;
  courtCount: number;
  scoringPreset: ScoringPreset;
  matchGenerationType: MatchGenerationType;
  matchTimerEnabled: boolean;
  matchTimedCapMinutes: number;
  customPointsTotal?: number | null;
  creatorLevel: number;
  playerLevelRange: [number, number];
  invitedLevels: number[];
  baselineRounds: number;
  suggestedMaxParticipants: number;
  suggestedCourts: number;
};

export type EventDurationEstimate = {
  playMinutes: number;
  label: string;
};

export function defaultBaselineRounds(
  matchGenerationType: MatchGenerationType,
  gameType: GameType,
): number {
  if (ROTATION_GENERATIONS.has(matchGenerationType)) {
    if (matchGenerationType === 'KING_OF_COURT' || gameType === 'KOTC') return 8;
    if (matchGenerationType === 'ROUND_ROBIN') return 7;
    if (matchGenerationType === 'ESCALERA' || gameType === 'LADDER') return 7;
    return 6;
  }
  return 1;
}

export function effectiveGenerationForDuration(
  maxParticipants: number,
  templateGeneration: MatchGenerationType,
): MatchGenerationType {
  if (maxParticipants <= 5) return 'AUTOMATIC';
  return templateGeneration;
}

function isSmallGroupAutomatic(
  maxParticipants: number,
  generation: MatchGenerationType,
): boolean {
  return generation === 'AUTOMATIC' && maxParticipants <= 5;
}

/** ≤5p AUTOMATIC: 4v4 points ≈ 3 mini-matches; classic host templates = one fixture. */
function automaticMatchesInRound(
  maxParticipants: number,
  playersPerMatch: 2 | 4,
  scoringPreset: ScoringPreset,
): number {
  if (
    playersPerMatch === 4 &&
    maxParticipants >= 4 &&
    maxParticipants <= 5 &&
    scoringPreset.startsWith('POINTS_')
  ) {
    return 3;
  }
  if (playersPerMatch === 2 && maxParticipants === 2) return 1;
  return 1;
}

function scaledRotationRounds(
  baselineRounds: number,
  maxParticipants: number,
  playersPerMatch: 2 | 4,
  courtCount: number,
  suggestedMaxParticipants: number,
  _suggestedCourts: number,
  scoringPreset: ScoringPreset,
): number {
  const n0 = Math.max(1, suggestedMaxParticipants);
  const n = Math.max(1, maxParticipants);
  const courts = Math.max(1, courtCount);
  const idealCourts = Math.max(1, Math.floor(n / playersPerMatch));
  const capacityCourts = Math.max(1, Math.min(MAX_EVENT_COURTS, idealCourts));

  let raw = baselineRounds * (n / n0);
  if (playersPerMatch === 4 && n >= 6 && scoringPreset.startsWith('POINTS_')) {
    raw = Math.max(raw, 3);
  }
  if (courts < capacityCourts) {
    raw *= capacityCourts / courts;
  }
  if (idealCourts > MAX_EVENT_COURTS) {
    raw *= idealCourts / MAX_EVENT_COURTS;
  }
  return Math.max(1, Math.round(raw * 10) / 10);
}

export function estimateEventDuration(input: EventDurationEstimateInput): EventDurationEstimate {
  const generation = effectiveGenerationForDuration(
    input.maxParticipants,
    input.matchGenerationType,
  );

  const baseMatchMinutes = resolveMatchMinutes(input.scoringPreset, {
    matchTimerEnabled: input.matchTimerEnabled,
    matchTimedCapMinutes: input.matchTimedCapMinutes,
    customPointsTotal: input.customPointsTotal,
  });

  const effectiveLevel = resolveEffectivePlayLevel({
    creatorLevel: input.creatorLevel,
    playerLevelRange: input.playerLevelRange,
    invitedLevels: input.invitedLevels,
  });

  const matchMinutes = applyLevelToMatchMinutes(input.sport, baseMatchMinutes, effectiveLevel);
  const gapMinutes = roundGapMinutesForPreset(input.scoringPreset);

  let playMinutes: number;

  if (
    isSmallGroupAutomatic(input.maxParticipants, generation)
  ) {
    const matches = automaticMatchesInRound(
      input.maxParticipants,
      input.playersPerMatch,
      input.scoringPreset,
    );
    const betweenMatchGap = matches > 1 ? 2 : 0;
    playMinutes =
      matches * matchMinutes + Math.max(0, matches - 1) * betweenMatchGap;
  } else if (ROTATION_GENERATIONS.has(generation)) {
    const rounds = scaledRotationRounds(
      input.baselineRounds,
      input.maxParticipants,
      input.playersPerMatch,
      input.courtCount,
      input.suggestedMaxParticipants,
      input.suggestedCourts,
      input.scoringPreset,
    );
    playMinutes =
      rounds * matchMinutes + Math.max(0, Math.ceil(rounds) - 1) * gapMinutes;
  } else {
    playMinutes = matchMinutes;
  }

  playMinutes = Math.max(5, Math.round(playMinutes));
  return {
    playMinutes,
    label: formatEventDurationLabel(playMinutes),
  };
}

export function estimateFromCreateTemplate(
  tpl: CreateTemplate,
  ctx: Omit<
    EventDurationEstimateInput,
    | 'scoringPreset'
    | 'matchGenerationType'
    | 'matchTimerEnabled'
    | 'matchTimedCapMinutes'
    | 'baselineRounds'
    | 'suggestedMaxParticipants'
    | 'suggestedCourts'
  > & {
    scoringPreset?: ScoringPreset;
    matchTimedCapMinutes?: number;
    matchTimerEnabled?: boolean;
    customPointsTotal?: number | null;
  },
): EventDurationEstimate {
  const matchGenerationType = resolveCreateTemplateGeneration(tpl, ctx.maxParticipants);

  return estimateEventDuration({
    ...ctx,
    scoringPreset: ctx.scoringPreset ?? tpl.scoringPreset,
    matchGenerationType,
    matchTimerEnabled: ctx.matchTimerEnabled ?? tpl.matchTimerEnabled ?? false,
    matchTimedCapMinutes: ctx.matchTimedCapMinutes ?? tpl.matchTimedCapMinutes ?? 0,
    baselineRounds: tpl.baselineRounds ?? defaultBaselineRounds(matchGenerationType, tpl.gameType),
    suggestedMaxParticipants: tpl.suggestedMaxParticipants,
    suggestedCourts: tpl.suggestedCourts,
    customPointsTotal: ctx.customPointsTotal,
  });
}

export { roundDisplayMinutes, formatEventDurationLabel };
