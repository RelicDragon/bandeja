import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GamesStat } from '@/api/users';

type PlayerAgg = {
  gamesLast30Days: number;
  gamesStats: GamesStat[];
};

function pickStat(stats: GamesStat[], type: GamesStat['type']): GamesStat | undefined {
  return stats.find((s) => s.type === type);
}

function numClass(a: number, b: number, higherBetter: boolean): string {
  if (a === b) return 'text-gray-900 dark:text-white';
  const aBetter = higherBetter ? a > b : a < b;
  return aBetter ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-500';
}

function strWinRateClass(left: string, right: string): string {
  const a = parseFloat(left);
  const b = parseFloat(right);
  if (a === b || (Number.isNaN(a) && Number.isNaN(b))) return 'text-gray-900 dark:text-white';
  if (Number.isNaN(a)) return 'text-gray-500 dark:text-gray-500';
  if (Number.isNaN(b)) return 'text-green-600 dark:text-green-400';
  return a > b ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-500';
}

interface ComparisonPlayerStatsPanelProps {
  current: PlayerAgg;
  other: PlayerAgg;
}

export const ComparisonPlayerStatsPanel = ({ current, other }: ComparisonPlayerStatsPanelProps) => {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<GamesStat['type']>('30');

  const cur = pickStat(current.gamesStats, period);
  const oth = pickStat(other.gamesStats, period);
  if (!cur || !oth) return null;

  const curWinRate = cur.totalMatches > 0 ? ((cur.wins / cur.totalMatches) * 100).toFixed(1) : '0';
  const othWinRate = oth.totalMatches > 0 ? ((oth.wins / oth.totalMatches) * 100).toFixed(1) : '0';

  const Row = ({
    label,
    left,
    right,
    higherBetter = true,
  }: {
    label: string;
    left: number;
    right: number;
    higherBetter?: boolean;
  }) => (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl px-6 py-3">
      <div className="grid grid-cols-3 gap-4 items-center">
        <div className="text-right">
          <div className={`text-2xl font-bold ${numClass(left, right, higherBetter)}`}>{left}</div>
        </div>
        <div className="text-center text-sm font-semibold text-gray-600 dark:text-gray-400">{label}</div>
        <div className="text-left">
          <div className={`text-2xl font-bold ${numClass(right, left, higherBetter)}`}>{right}</div>
        </div>
      </div>
    </div>
  );

  const RowStr = ({ label, left, right }: { label: string; left: string; right: string }) => (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl px-6 py-3">
      <div className="grid grid-cols-3 gap-4 items-center">
        <div className="text-right">
          <div className={`text-2xl font-bold ${strWinRateClass(left, right)}`}>{left}%</div>
        </div>
        <div className="text-center text-sm font-semibold text-gray-600 dark:text-gray-400">{label}</div>
        <div className="text-left">
          <div className={`text-2xl font-bold ${strWinRateClass(right, left)}`}>{right}%</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        <button
          type="button"
          onClick={() => setPeriod('30')}
          className={`flex-1 px-3 py-2 rounded-lg font-medium text-xs transition-all duration-300 ease-in-out ${
            period === '30'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          {t('playerCard.last30Days')}
        </button>
        <button
          type="button"
          onClick={() => setPeriod('90')}
          className={`flex-1 px-3 py-2 rounded-lg font-medium text-xs transition-all duration-300 ease-in-out ${
            period === '90'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          {t('playerCard.last90Days')}
        </button>
        <button
          type="button"
          onClick={() => setPeriod('all')}
          className={`flex-1 px-3 py-2 rounded-lg font-medium text-xs transition-all duration-300 ease-in-out ${
            period === 'all'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          {t('playerCard.allGames')}
        </button>
      </div>

      <Row
        label={t('playerCard.gamesLast30Days')}
        left={current.gamesLast30Days}
        right={other.gamesLast30Days}
      />

      <Row label={t('playerCard.totalGames')} left={cur.totalMatches} right={oth.totalMatches} />
      <Row label={t('playerCard.winsShort')} left={cur.wins} right={oth.wins} />
      <Row label={t('playerCard.tiesShort')} left={cur.ties} right={oth.ties} />
      <Row label={t('playerCard.lossesShort')} left={cur.losses} right={oth.losses} />
      <RowStr label={t('playerCard.winRate')} left={curWinRate} right={othWinRate} />
    </div>
  );
};
