import { useTranslation } from 'react-i18next';

type PlayerActivityCountsProps = {
  gamesPlayed: number;
  trainingAttendanceCount?: number;
  className?: string;
};

function asCount(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

export function PlayerActivityCounts({
  gamesPlayed,
  trainingAttendanceCount,
  className = '',
}: PlayerActivityCountsProps) {
  const { t } = useTranslation();
  const games = asCount(gamesPlayed);
  const trainings = asCount(trainingAttendanceCount);
  const quiet = games === 0 && trainings === 0;
  const gamesLabel = t('playerCard.gamesCount', { count: games });
  const trainingsLabel = t('playerCard.trainingsCount', { count: trainings });

  return (
    <p
      data-testid="player-activity-counts"
      className={`max-w-full text-[11px] font-medium leading-snug tracking-tight tabular-nums ${quiet ? 'opacity-70' : ''} ${className}`.trim()}
    >
      {gamesLabel}
      <span aria-hidden className="font-normal opacity-40">
        {'\u00a0·\u00a0'}
      </span>
      <span className={trainings === 0 ? 'opacity-70' : undefined}>{trainingsLabel}</span>
    </p>
  );
}
