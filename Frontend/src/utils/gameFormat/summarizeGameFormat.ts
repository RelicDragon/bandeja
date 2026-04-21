import type { TFunction } from 'i18next';
import { MatchGenerationType, ScoringMode, ScoringPreset } from '@/types';

export interface SummarizeArgs {
  scoringMode: ScoringMode;
  scoringPreset: ScoringPreset;
  generationType?: MatchGenerationType;
  hasGoldenPoint?: boolean;
  isTimed?: boolean;
  matchTimedCapMinutes?: number;
  customPointsTotal?: number | null;
}

const genKey = (g: MatchGenerationType) =>
  g.split('_').map((s) => s.charAt(0) + s.slice(1).toLowerCase()).join('');

export const summarizeGameFormat = (t: TFunction, args: SummarizeArgs): string => {
  let scoring: string;
  if (args.isTimed) {
    scoring =
      args.scoringMode === 'CLASSIC'
        ? t('gameFormat.scoringShort.CLASSIC_TIMED')
        : t('gameFormat.scoringShort.TIMED');
    const cap =
      typeof args.matchTimedCapMinutes === 'number' && args.matchTimedCapMinutes >= 1 && args.matchTimedCapMinutes <= 60
        ? args.matchTimedCapMinutes
        : 15;
    scoring = `${scoring} · ${t('gameFormat.timedMatch.minutesLabel', { minutes: cap })}`;
  } else if (args.customPointsTotal != null) {
    scoring = t('gameFormat.customPoints.short', { count: args.customPointsTotal });
  } else {
    scoring = t(`gameFormat.scoringShort.${args.scoringPreset}`);
  }

  const parts: string[] = [scoring];
  if (args.scoringMode === 'CLASSIC' && args.hasGoldenPoint) parts.push(t('gameFormat.goldenPointShort'));
  if (args.generationType && args.generationType !== 'HANDMADE') {
    parts.push(t(`gameFormat.generation.${genKey(args.generationType)}.title`));
  }
  return parts.filter(Boolean).join(' · ');
};
