import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Flame, Heart, Timer } from 'lucide-react';
import { usersApi, type GameWorkoutSessionListItem } from '@/api/users';
import { buildUrl } from '@/utils/urlSchema';
import { formatWorkoutDuration } from '@/utils/workoutFormat';

type LoadPhase = 'loading' | 'empty' | 'error' | 'data';

export const ProfileWorkoutHealthSection = () => {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<LoadPhase>('loading');
  const [rows, setRows] = useState<GameWorkoutSessionListItem[]>([]);

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const res = await usersApi.getWorkoutSessions({ limit: 15 });
      const list = res.data ?? [];
      setRows(list);
      setPhase(list.length === 0 ? 'empty' : 'data');
    } catch {
      setRows([]);
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (phase === 'loading') {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800/50">
        <div className="mb-2 h-5 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-600" />
        <div className="mb-3 h-3 w-full max-w-xs animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
        <div className="space-y-2">
          <div className="h-10 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700" />
          <div className="h-10 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700" />
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
        <p className="text-sm text-gray-700 dark:text-gray-300">{t('healthWorkout.loadErrorProfile')}</p>
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

  if (phase === 'empty') {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 p-4 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800/40 dark:text-gray-400">
        {t('healthWorkout.emptyProfile')}
      </div>
    );
  }

  const totalKcal = rows.reduce((acc, r) => acc + (r.totalEnergyKcal ?? 0), 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800/50">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('healthWorkout.title')}</h3>
        {totalKcal > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Σ {Math.round(totalKcal)} {t('healthWorkout.kcal')}
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t('healthWorkout.subtitle')}</p>
      <ul className="space-y-3">
        {rows.map((r) => {
          const title = r.game.name?.trim() || r.game.club?.name || r.game.gameType;
          const gameUrl = buildUrl('game', { id: r.game.id });
          return (
            <li key={r.id} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0 dark:border-gray-700">
              <Link to={gameUrl} className="block text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
                {title}
              </Link>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-400">
                {r.totalEnergyKcal != null && (
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Flame className="h-3.5 w-3.5 text-orange-500" />
                    {Math.round(r.totalEnergyKcal)} {t('healthWorkout.kcal')}
                  </span>
                )}
                {r.avgHeartRate != null && (
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Heart className="h-3.5 w-3.5 text-rose-500" />
                    {Math.round(r.avgHeartRate)} {t('healthWorkout.avgBpm')}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Timer className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  {formatWorkoutDuration(r.durationSeconds)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
