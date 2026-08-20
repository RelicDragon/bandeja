import { useTranslation } from 'react-i18next';

type PlayerActivityCountsProps = {
  gamesPlayed: number;
  trainingAttendanceCount: number;
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

  return (
    <p
      data-testid="player-activity-counts"
      className={`flex flex-wrap items-baseline justify-center gap-x-1.5 text-xs tabular-nums ${className}`.trim()}
    >
      <span>{t('playerCard.gamesCount', { count: games })}</span>
      <span aria-hidden className="opacity-40">
        ·
      </span>
      <span>{t('playerCard.trainingsCount', { count: trainings })}</span>
    </p>
  );
}
