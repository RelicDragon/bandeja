import type { TFunction } from 'i18next';
import { getSportConfig } from '@/sport/sportRegistry';
import { MatchGenerationType, ScoringMode, ScoringPreset, WinnerOfGame } from '@/types';
import { tScoringShort } from './gameFormatI18n';

export interface SummarizeArgs {
  scoringMode: ScoringMode;
  scoringPreset: ScoringPreset;
  generationType?: MatchGenerationType;
  deucesBeforeGoldenPoint?: number | null;
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
  if (w === 'BY_SCORES_MADE') return t('gameResults.byScoresMade');
  return null;
}

const genKey = (g: MatchGenerationType) =>
  g.split('_').map((s) => s.charAt(0) + s.slice(1).toLowerCase()).join('');

export function matchFormatDisplay(
  t: TFunction,
  playersPerMatch?: number,
  sport?: string | null,
): { label: string; hint: string } | null {
  if (playersPerMatch !== 2 && playersPerMatch !== 4) return null;
  if (sport == null) return null;
  const sportConfig = getSportConfig(sport);
  if (sportConfig.allowedPlayerCountsPerMatch.length <= 1) return null;
  if (playersPerMatch === sportConfig.defaultPlayersPerMatch) return null;
  return {
    label: playersPerMatch === 2 ? t('sport.matchSingles') : t('sport.matchDoubles'),
    hint: playersPerMatch === 2 ? t('sport.match1v1') : t('sport.match2v2'),
  };
}

export function matchFormatSummaryPart(
  t: TFunction,
  playersPerMatch?: number,
  sport?: string | null,
): string | null {
  return matchFormatDisplay(t, playersPerMatch, sport)?.label ?? null;
}

export const summarizeGameFormat = (
  t: TFunction,
  args: SummarizeArgs,
  sport?: string | null,
): string => {
  let scoring: string;
  if (args.customPointsTotal != null) {
    scoring = t('gameFormat.customPoints.short', { count: args.customPointsTotal });
  } else {
    scoring = tScoringShort(t, args.scoringPreset, sport);
  }
  if (args.matchTimerEnabled) {
    const cap =
      typeof args.matchTimedCapMinutes === 'number' && args.matchTimedCapMinutes >= 1 && args.matchTimedCapMinutes <= 60
        ? args.matchTimedCapMinutes
        : 15;
    scoring = `${scoring} · ${t('gameFormat.timedMatch.minutesLabel', { minutes: cap })}`;
  }

  const parts: string[] = [scoring];
  if (args.scoringMode === 'CLASSIC' && args.deucesBeforeGoldenPoint != null) {
    parts.push(
      args.deucesBeforeGoldenPoint === 0
        ? t('gameFormat.goldenPointShort')
        : t('gameFormat.goldenPoint.afterDeucesShort', { count: args.deucesBeforeGoldenPoint }),
    );
  }
  if (args.generationType && args.generationType !== 'HANDMADE') {
    parts.push(t(`gameFormat.generation.${genKey(args.generationType)}.title`));
  }
  const rankBy = winnerOfGameSummaryPart(t, args.winnerOfGame);
  if (rankBy) parts.push(rankBy);
  return parts.filter(Boolean).join(' · ');
};
