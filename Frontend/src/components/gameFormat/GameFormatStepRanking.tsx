import { useTranslation } from 'react-i18next';
import { Trophy, TrendingUp, Check } from 'lucide-react';
import { GameSetupParams } from '@/types';

interface GameFormatStepRankingProps {
  pointsPerWin: number;
  pointsPerLoose: number;
  pointsPerTie: number;
  winnerOfGame: GameSetupParams['winnerOfGame'];
  onChange: (patch: {
    pointsPerWin?: number;
    pointsPerLoose?: number;
    pointsPerTie?: number;
    winnerOfGame?: GameSetupParams['winnerOfGame'];
  }) => void;
  onDone?: () => void;
}

const pill = (active: boolean) =>
  `px-3 py-1.5 text-xs rounded-md font-semibold transition-all duration-200 ${
    active
      ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md'
      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
  }`;

const Stepper = ({
  label,
  value,
  onChange,
  max = 5,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  max?: number;
}) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>
    <div className="flex gap-1">
      {Array.from({ length: max + 1 }, (_, i) => (
        <button key={i} type="button" onClick={() => onChange(i)} className={pill(value === i)}>
          {i}
        </button>
      ))}
    </div>
  </div>
);

const DEFAULT_STANDING_POINTS = { pointsPerWin: 3, pointsPerTie: 1, pointsPerLoose: 0 } as const;

export const GameFormatStepRanking = ({
  pointsPerWin,
  pointsPerLoose,
  pointsPerTie,
  winnerOfGame,
  onChange,
  onDone,
}: GameFormatStepRankingProps) => {
  const { t } = useTranslation();

  const selectByPoints = () => {
    const sum = pointsPerWin + pointsPerTie + pointsPerLoose;
    if (sum === 0) {
      onChange({ winnerOfGame: 'BY_POINTS', ...DEFAULT_STANDING_POINTS });
    } else {
      onChange({ winnerOfGame: 'BY_POINTS' });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 px-1">{t('gameFormat.stepRankingHint')}</p>

      <div className="p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center">
            <TrendingUp size={16} className="text-primary-600 dark:text-primary-400" />
          </div>
          <div className="text-sm font-semibold text-gray-900 dark:text-white">{t('gameResults.winnerOfGame')}</div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className={`w-full text-left ${pill(winnerOfGame === 'BY_MATCHES_WON')}`}
            onClick={() => onChange({ winnerOfGame: 'BY_MATCHES_WON' })}
          >
            {t('gameResults.byMatchesWon')}
          </button>
          <button
            type="button"
            className={`w-full text-left ${pill(winnerOfGame === 'BY_SCORES_DELTA')}`}
            onClick={() => onChange({ winnerOfGame: 'BY_SCORES_DELTA' })}
          >
            {t('gameResults.byScoresDelta')}
          </button>
          <button
            type="button"
            className={`w-full text-left ${pill(winnerOfGame === 'BY_POINTS')}`}
            onClick={selectByPoints}
          >
            {t('gameResults.byPoints')}
          </button>
        </div>
      </div>

      {winnerOfGame === 'BY_POINTS' && (
        <div className="p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center">
              <Trophy size={16} className="text-primary-600 dark:text-primary-400" />
            </div>
            <div className="text-sm font-semibold text-gray-900 dark:text-white">{t('gameFormat.points.title')}</div>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 pl-1 -mt-1">
            {t('gameFormat.standingPointsHint')}
          </p>
          <div className="space-y-2 pl-1">
            <Stepper label={t('gameResults.win')} value={pointsPerWin} onChange={(n) => onChange({ pointsPerWin: n })} />
            <Stepper label={t('gameResults.tie')} value={pointsPerTie} onChange={(n) => onChange({ pointsPerTie: n })} />
            <Stepper label={t('gameResults.loose')} value={pointsPerLoose} onChange={(n) => onChange({ pointsPerLoose: n })} />
          </div>
        </div>
      )}

      {onDone && (
        <button
          type="button"
          onClick={onDone}
          className="w-full px-4 py-2.5 text-sm rounded-lg font-semibold bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white shadow-md shadow-primary-500/30 transition-all duration-200 flex items-center justify-center gap-1.5"
        >
          <Check size={16} />
          {t('common.done')}
        </button>
      )}
    </div>
  );
};
