import type { CreateTemplate, CreateTemplateId } from '@/sport/createFlow';
import type { GameType, MatchGenerationType, ScoringPreset } from '@/types';
import type { Sport } from '@shared/sport';
import {
  defaultBaselineRounds,
  estimateEventDuration,
  estimateFromCreateTemplate,
} from '@/utils/eventDuration/estimateEventDuration';
import { effectiveCourtCountForEstimate } from '@/utils/eventDuration/suggestCourtCount';

export type CreateTemplateDurationContext = {
  sport: Sport;
  maxParticipants: number;
  playersPerMatch: 2 | 4;
  selectedCourtCount: number;
  creatorLevel: number;
  playerLevelRange: [number, number];
  invitedLevels: number[];
  selectedTemplateId: CreateTemplateId | null;
  liveScoringPreset?: ScoringPreset;
  liveMatchTimedCapMinutes?: number;
  liveMatchTimerEnabled?: boolean;
  liveCustomPointsTotal?: number | null;
};

export function showTemplateDurationBadge(tpl: CreateTemplate): boolean {
  return tpl.inlineConfig?.type !== 'timed_duration';
}

function courtCountForTemplate(
  maxParticipants: number,
  playersPerMatch: 2 | 4,
  selectedCourtCount: number,
): number {
  return effectiveCourtCountForEstimate(maxParticipants, playersPerMatch, selectedCourtCount);
}

export function estimateDurationLabelForTemplate(
  tpl: CreateTemplate,
  ctx: CreateTemplateDurationContext,
): string {
  const isSelected = ctx.selectedTemplateId === tpl.id;
  const courtCount = courtCountForTemplate(
    ctx.maxParticipants,
    ctx.playersPerMatch,
    ctx.selectedCourtCount,
  );

  if (isSelected && tpl.inlineConfig?.type === 'points_total' && ctx.liveScoringPreset) {
    return estimateFromCreateTemplate(tpl, {
      sport: ctx.sport,
      maxParticipants: ctx.maxParticipants,
      playersPerMatch: ctx.playersPerMatch,
      courtCount,
      creatorLevel: ctx.creatorLevel,
      playerLevelRange: ctx.playerLevelRange,
      invitedLevels: ctx.invitedLevels,
      scoringPreset: ctx.liveScoringPreset,
      matchTimedCapMinutes: ctx.liveMatchTimedCapMinutes,
      matchTimerEnabled: ctx.liveMatchTimerEnabled,
      customPointsTotal: ctx.liveCustomPointsTotal,
    }).label;
  }

  if (isSelected && tpl.inlineConfig?.type === 'timed_duration') {
    return estimateFromCreateTemplate(tpl, {
      sport: ctx.sport,
      maxParticipants: ctx.maxParticipants,
      playersPerMatch: ctx.playersPerMatch,
      courtCount,
      creatorLevel: ctx.creatorLevel,
      playerLevelRange: ctx.playerLevelRange,
      invitedLevels: ctx.invitedLevels,
      matchTimedCapMinutes: ctx.liveMatchTimedCapMinutes,
      matchTimerEnabled: true,
    }).label;
  }

  return estimateFromCreateTemplate(tpl, {
    sport: ctx.sport,
    maxParticipants: ctx.maxParticipants,
    playersPerMatch: ctx.playersPerMatch,
    courtCount,
    creatorLevel: ctx.creatorLevel,
    playerLevelRange: ctx.playerLevelRange,
    invitedLevels: ctx.invitedLevels,
  }).label;
}

export function estimateDurationLabelForCustomFormat(
  ctx: CreateTemplateDurationContext & {
    scoringPreset: ScoringPreset;
    matchGenerationType: MatchGenerationType;
    gameType: GameType;
    matchTimerEnabled: boolean;
    matchTimedCapMinutes: number;
    customPointsTotal?: number | null;
  },
): string {
  const courtCount = courtCountForTemplate(
    ctx.maxParticipants,
    ctx.playersPerMatch,
    ctx.selectedCourtCount,
  );
  return estimateEventDuration({
    sport: ctx.sport,
    maxParticipants: ctx.maxParticipants,
    playersPerMatch: ctx.playersPerMatch,
    courtCount,
    scoringPreset: ctx.scoringPreset,
    matchGenerationType: ctx.matchGenerationType,
    matchTimerEnabled: ctx.matchTimerEnabled,
    matchTimedCapMinutes: ctx.matchTimedCapMinutes,
    customPointsTotal: ctx.customPointsTotal,
    creatorLevel: ctx.creatorLevel,
    playerLevelRange: ctx.playerLevelRange,
    invitedLevels: ctx.invitedLevels,
    baselineRounds: defaultBaselineRounds(ctx.matchGenerationType, ctx.gameType),
    suggestedMaxParticipants: Math.max(4, ctx.maxParticipants),
    suggestedCourts: courtCount,
  }).label;
}
