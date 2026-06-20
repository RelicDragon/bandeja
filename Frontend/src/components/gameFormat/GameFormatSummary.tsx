import { useTranslation } from 'react-i18next';
import { GenderTeam, MatchGenerationType, ScoringMode, ScoringPreset, WinnerOfGame } from '@/types';
import { matchFormatSummaryPart, summarizeGameFormat } from '@/utils/gameFormat';
import { genderTeamsSummaryLabelKey } from '@/utils/genderTeamsSummaryLabel';

const SUMMARY_SEP = ' · ';

interface GameFormatSummaryProps {
  scoringMode: ScoringMode;
  scoringPreset: ScoringPreset;
  generationType?: MatchGenerationType;
  deucesBeforeGoldenPoint?: number | null;
  matchTimerEnabled?: boolean;
  matchTimedCapMinutes?: number;
  customPointsTotal?: number | null;
  winnerOfGame?: WinnerOfGame;
  playersPerMatch?: number;
  sport?: string | null;
  genderTeams?: GenderTeam;
  className?: string;
  twoRows?: boolean;
}

export const GameFormatSummary = ({
  scoringMode,
  scoringPreset,
  generationType,
  deucesBeforeGoldenPoint,
  matchTimerEnabled,
  matchTimedCapMinutes,
  customPointsTotal,
  winnerOfGame,
  playersPerMatch,
  sport,
  genderTeams,
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
      deucesBeforeGoldenPoint,
      matchTimerEnabled,
      matchTimedCapMinutes,
      customPointsTotal,
      winnerOfGame,
    },
    sport,
  );
  const genderLabelKey = genderTeams ? genderTeamsSummaryLabelKey(genderTeams) : null;
  const genderLabel = genderLabelKey ? t(genderLabelKey) : null;
  const summaryWithGender =
    genderLabel && summary ? `${summary}${SUMMARY_SEP}${genderLabel}` : genderLabel || summary;
  const matchLabel = matchFormatSummaryPart(t, playersPerMatch, sport);
  const withMatch = (line: string) =>
    matchLabel && line ? `${matchLabel}${SUMMARY_SEP}${line}` : matchLabel || line;

  if (!twoRows) {
    return <span className={className}>{withMatch(summaryWithGender)}</span>;
  }
  const cut = summaryWithGender.indexOf(SUMMARY_SEP);
  if (cut === -1) {
    return <span className={className}>{withMatch(summaryWithGender)}</span>;
  }
  const row1 = summaryWithGender.slice(0, cut);
  const row2 = summaryWithGender.slice(cut + SUMMARY_SEP.length);
  return (
    <span className={className}>
      <span className="block truncate">{withMatch(row1)}</span>
      <span className="block truncate">{row2}</span>
    </span>
  );
};
