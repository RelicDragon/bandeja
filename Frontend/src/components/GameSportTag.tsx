import { useTranslation } from 'react-i18next';
import { SportPublicIcon } from '@/components/sport/SportPublicIcon';
import { getSportConfig, type Sport } from '@/sport/sportRegistry';
import { matchFormatSummaryPart } from '@/utils/gameFormat';

const META_TAG_CLASS =
  'inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-300';

interface GameSportTagProps {
  sport: Sport;
  className?: string;
}

export function GameSportTag({ sport, className = '' }: GameSportTagProps) {
  const { t } = useTranslation();
  const config = getSportConfig(sport);
  return (
    <span className={`${META_TAG_CLASS} ${className}`.trim()}>
      <SportPublicIcon sport={sport} className="h-4 w-4 shrink-0 object-contain" />
      <span>{t(config.labelKey)}</span>
    </span>
  );
}

interface GameMatchFormatTagProps {
  label: string;
  className?: string;
}

export function GameMatchFormatTag({ label, className = '' }: GameMatchFormatTagProps) {
  return <span className={`${META_TAG_CLASS} ${className}`.trim()}>{label}</span>;
}

interface GameSportTagRowProps {
  sport: Sport;
  showSport: boolean;
  playersPerMatch: number;
  showMatchFormat?: boolean;
  className?: string;
}

export function GameSportTagRow({
  sport,
  showSport,
  playersPerMatch,
  showMatchFormat = true,
  className = 'mb-2',
}: GameSportTagRowProps) {
  const { t } = useTranslation();
  const matchFormatLabel = showMatchFormat
    ? matchFormatSummaryPart(t, playersPerMatch, sport)
    : null;
  if (!showSport && !matchFormatLabel) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`.trim()}>
      {showSport && <GameSportTag sport={sport} />}
      {matchFormatLabel && <GameMatchFormatTag label={matchFormatLabel} />}
    </div>
  );
}
