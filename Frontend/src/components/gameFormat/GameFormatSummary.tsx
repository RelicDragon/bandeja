import { useTranslation } from 'react-i18next';
import { MatchGenerationType, ScoringMode, ScoringPreset, WinnerOfGame } from '@/types';
import { matchFormatSummaryPart, summarizeGameFormat } from '@/utils/gameFormat';

const SUMMARY_SEP = ' · ';

interface GameFormatSummaryProps {
  scoringMode: ScoringMode;
  scoringPreset: ScoringPreset;
  generationType?: MatchGenerationType;
  hasGoldenPoint?: boolean;
  matchTimerEnabled?: boolean;
  matchTimedCapMinutes?: number;
  customPointsTotal?: number | null;
  winnerOfGame?: WinnerOfGame;
  playersPerMatch?: number;
  sport?: string | null;
  className?: string;
  twoRows?: boolean;
}

export const GameFormatSummary = ({
  scoringMode,
  scoringPreset,
  generationType,
  hasGoldenPoint,
  matchTimerEnabled,
  matchTimedCapMinutes,
  customPointsTotal,
  winnerOfGame,
  playersPerMatch,
  sport,
  className,
  twoRows,
}: GameFormatSummaryProps) => {
  const { t } = useTranslation();
  const summary = summarizeGameFormat(
    t,
    {
      scoringMode,
      scoringPreset,
      generationType,
      hasGoldenPoint,
      matchTimerEnabled,
      matchTimedCapMinutes,
      customPointsTotal,
      winnerOfGame,
    },
    sport,
  );
  const matchLabel = matchFormatSummaryPart(t, playersPerMatch, sport);
  const withMatch = (line: string) =>
    matchLabel && line ? `${matchLabel}${SUMMARY_SEP}${line}` : matchLabel || line;

  if (!twoRows) {
    return <span className={className}>{withMatch(summary)}</span>;
  }
  const cut = summary.indexOf(SUMMARY_SEP);
  if (cut === -1) {
    return <span className={className}>{withMatch(summary)}</span>;
  }
  const row1 = summary.slice(0, cut);
  const row2 = summary.slice(cut + SUMMARY_SEP.length);
  return (
    <span className={className}>
      <span className="block truncate">{withMatch(row1)}</span>
      <span className="block truncate">{row2}</span>
    </span>
  );
};
