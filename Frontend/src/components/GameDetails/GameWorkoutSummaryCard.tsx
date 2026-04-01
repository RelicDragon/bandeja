import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flame, Heart, Timer } from 'lucide-react';
import { gamesApi, type GameWorkoutSummary } from '@/api/games';
import { formatWorkoutDuration } from '@/utils/workoutFormat';

interface GameWorkoutSummaryCardProps {
  gameId: string;
}

type LoadPhase = 'loading' | 'empty' | 'error' | 'data';

export const GameWorkoutSummaryCard = ({ gameId }: GameWorkoutSummaryCardProps) => {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<LoadPhase>('loading');
  const [row, setRow] = useState<GameWorkoutSummary | null>(null);

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const res = await gamesApi.getMyWorkoutForGame(gameId);
      const data = res.data;
      if (data) {
        setRow(data);
        setPhase('data');
      } else {
        setRow(null);
        setPhase('empty');
      }
    } catch {
      setRow(null);
      setPhase('error');
    }
  }, [gameId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (phase === 'loading') {
    return (
      <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-600 dark:bg-gray-800/40">
        <div className="h-3 w-28 animate-pulse rounded bg-gray-200 dark:bg-gray-600" />
        <div className="mt-3 flex gap-3">
          <div className="h-4 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-600" />
          <div className="h-4 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-600" />
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
        <p className="text-gray-700 dark:text-gray-300">{t('healthWorkout.loadError')}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-2 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
        >
          {t('healthWorkout.retry')}
        </button>
      </div>
    );
  }

  if (phase === 'empty' || !row) return null;

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-gradient-to-br from-orange-50/80 to-rose-50/60 p-4 dark:border-gray-600 dark:from-orange-950/30 dark:to-rose-950/20">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {t('healthWorkout.yourSession')}
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        {row.totalEnergyKcal != null && (
          <div className="flex items-center gap-1.5 text-orange-700 dark:text-orange-300">
            <Flame className="h-4 w-4 shrink-0" />
            <span className="font-semibold tabular-nums">{Math.round(row.totalEnergyKcal)}</span>
            <span className="text-gray-600 dark:text-gray-400">{t('healthWorkout.kcal')}</span>
          </div>
        )}
        {row.avgHeartRate != null && (
          <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
            <Heart className="h-4 w-4 shrink-0" />
            <span className="font-semibold tabular-nums">{Math.round(row.avgHeartRate)}</span>
            <span className="text-gray-600 dark:text-gray-400">{t('healthWorkout.avgBpm')}</span>
          </div>
        )}
        {row.maxHeartRate != null && (
          <div className="flex items-center gap-1.5 text-rose-600/90 dark:text-rose-400/90">
            <Heart className="h-4 w-4 shrink-0" />
            <span className="font-semibold tabular-nums">{Math.round(row.maxHeartRate)}</span>
            <span className="text-gray-600 dark:text-gray-400">{t('healthWorkout.maxBpm')}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
          <Timer className="h-4 w-4 shrink-0" />
          <span className="font-semibold tabular-nums">{formatWorkoutDuration(row.durationSeconds)}</span>
        </div>
      </div>
    </div>
  );
};
