import type { TFunction } from 'i18next';
import { MatchGenerationType, ScoringMode, ScoringPreset } from '@/types';

export interface SummarizeArgs {
  scoringMode: ScoringMode;
  scoringPreset: ScoringPreset;
  generationType?: MatchGenerationType;
  hasGoldenPoint?: boolean;
  matchTimerEnabled?: boolean;
  matchTimedCapMinutes?: number;
  customPointsTotal?: number | null;
  /** When preset is CUSTOM_SCORING — sets and ball cap per set for the summary line. */
  customScoringSets?: number;
  customScoringPointsPerSet?: number;
}

const genKey = (g: MatchGenerationType) =>
  g.split('_').map((s) => s.charAt(0) + s.slice(1).toLowerCase()).join('');

export const summarizeGameFormat = (t: TFunction, args: SummarizeArgs): string => {
  let scoring: string;
  if (args.customPointsTotal != null) {
    scoring = t('gameFormat.customPoints.short', { count: args.customPointsTotal });
  } else if (
    args.scoringPreset === 'CUSTOM_SCORING' &&
    typeof args.customScoringSets === 'number' &&
    typeof args.customScoringPointsPerSet === 'number'
  ) {
    scoring = t('gameFormat.customScoring.short', {
      sets: args.customScoringSets,
      points: args.customScoringPointsPerSet,
    });
  } else {
    scoring = t(`gameFormat.scoringShort.${args.scoringPreset}`);
  }
  if (args.matchTimerEnabled) {
    const cap =
      typeof args.matchTimedCapMinutes === 'number' && args.matchTimedCapMinutes >= 1 && args.matchTimedCapMinutes <= 60
        ? args.matchTimedCapMinutes
        : 15;
    scoring = `${scoring} · ${t('gameFormat.timedMatch.minutesLabel', { minutes: cap })}`;
  }

  const parts: string[] = [scoring];
  if (args.scoringMode === 'CLASSIC' && args.hasGoldenPoint) parts.push(t('gameFormat.goldenPointShort'));
  if (args.generationType && args.generationType !== 'HANDMADE') {
    parts.push(t(`gameFormat.generation.${genKey(args.generationType)}.title`));
  }
  return parts.filter(Boolean).join(' · ');
};
