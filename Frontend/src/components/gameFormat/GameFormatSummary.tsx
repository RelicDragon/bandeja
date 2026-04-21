import { useTranslation } from 'react-i18next';
import { MatchGenerationType, ScoringMode, ScoringPreset } from '@/types';
import { summarizeGameFormat } from '@/utils/gameFormat';

const SUMMARY_SEP = ' · ';

interface GameFormatSummaryProps {
  scoringMode: ScoringMode;
  scoringPreset: ScoringPreset;
  generationType?: MatchGenerationType;
  hasGoldenPoint?: boolean;
  isTimed?: boolean;
  matchTimedCapMinutes?: number;
  customPointsTotal?: number | null;
  className?: string;
  twoRows?: boolean;
}

export const GameFormatSummary = ({
  scoringMode,
  scoringPreset,
  generationType,
  hasGoldenPoint,
  isTimed,
  matchTimedCapMinutes,
  customPointsTotal,
  className,
  twoRows,
}: GameFormatSummaryProps) => {
  const { t } = useTranslation();
  const summary = summarizeGameFormat(t, {
    scoringMode,
    scoringPreset,
    generationType,
    hasGoldenPoint,
    isTimed,
    matchTimedCapMinutes,
    customPointsTotal,
  });
  if (!twoRows) {
    return <span className={className}>{summary}</span>;
  }
  const cut = summary.indexOf(SUMMARY_SEP);
  if (cut === -1) {
    return <span className={className}>{summary}</span>;
  }
  const row1 = summary.slice(0, cut);
  const row2 = summary.slice(cut + SUMMARY_SEP.length);
  return (
    <span className={className}>
      <span className="block truncate">{row1}</span>
      <span className="block truncate">{row2}</span>
    </span>
  );
};
