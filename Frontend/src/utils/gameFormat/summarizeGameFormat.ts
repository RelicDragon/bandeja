import type { TFunction } from 'i18next';
import { MatchGenerationType, ScoringMode, ScoringPreset, WinnerOfGame } from '@/types';

export interface SummarizeArgs {
  scoringMode: ScoringMode;
  scoringPreset: ScoringPreset;
  generationType?: MatchGenerationType;
  hasGoldenPoint?: boolean;
  matchTimerEnabled?: boolean;
  matchTimedCapMinutes?: number;
  customPointsTotal?: number | null;
  winnerOfGame?: WinnerOfGame;
}

function winnerOfGameSummaryPart(t: TFunction, w: WinnerOfGame | undefined): string | null {
  if (!w || w === 'PLAYOFF_FINALS') return null;
  if (w === 'BY_POINTS') return t('gameResults.byPoints');
  if (w === 'BY_MATCHES_WON') return t('gameResults.byMatchesWon');
  if (w === 'BY_SCORES_DELTA') return t('gameResults.byScoresDelta');
  return null;
}

const genKey = (g: MatchGenerationType) =>
  g.split('_').map((s) => s.charAt(0) + s.slice(1).toLowerCase()).join('');

export const summarizeGameFormat = (t: TFunction, args: SummarizeArgs): string => {
  let scoring: string;
  if (args.customPointsTotal != null) {
    scoring = t('gameFormat.customPoints.short', { count: args.customPointsTotal });
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
  const rankBy = winnerOfGameSummaryPart(t, args.winnerOfGame);
  if (rankBy) parts.push(rankBy);
  return parts.filter(Boolean).join(' · ');
};
