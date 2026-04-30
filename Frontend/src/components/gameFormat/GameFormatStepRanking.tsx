import { useTranslation } from 'react-i18next';
import { Trophy, TrendingUp, Check } from 'lucide-react';
import { GameSetupParams, ScoringMode } from '@/types';

interface GameFormatStepRankingProps {
  scoringMode: ScoringMode;
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
  allowByPoints?: boolean;
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

const RANKING_OPTION_ORDER: GameSetupParams['winnerOfGame'][] = [
  'BY_SCORES_DELTA',
  'BY_POINTS',
  'BY_MATCHES_WON',
];

function recommendedWinnerOfGame(mode: ScoringMode): GameSetupParams['winnerOfGame'] {
  return mode === 'POINTS' ? 'BY_SCORES_DELTA' : 'BY_MATCHES_WON';
}

function orderedWinnerOptions(recommended: GameSetupParams['winnerOfGame']): GameSetupParams['winnerOfGame'][] {
  return [
    ...RANKING_OPTION_ORDER.filter((k) => k === recommended),
    ...RANKING_OPTION_ORDER.filter((k) => k !== recommended),
  ];
}

function RecommendDot({ show, selected }: { show: boolean; selected: boolean }) {
  if (!show) return null;
  return (
    <span
      className={`shrink-0 w-2 h-2 rounded-full ring-2 ${
        selected ? 'bg-white ring-white/40' : 'bg-primary-500 ring-white dark:ring-gray-800'
      }`}
      aria-hidden
    />
  );
}

export const GameFormatStepRanking = ({
  scoringMode,
  pointsPerWin,
  pointsPerLoose,
  pointsPerTie,
  winnerOfGame,
  onChange,
  onDone,
  allowByPoints = true,
}: GameFormatStepRankingProps) => {
  const { t } = useTranslation();
  const recommended = recommendedWinnerOfGame(scoringMode);

  const selectByPoints = () => {
    const sum = pointsPerWin + pointsPerTie + pointsPerLoose;
    if (sum === 0) {
      onChange({ winnerOfGame: 'BY_POINTS', ...DEFAULT_STANDING_POINTS });
    } else {
      onChange({ winnerOfGame: 'BY_POINTS' });
    }
  };

  const visibleWinnerOptions = allowByPoints
    ? orderedWinnerOptions(recommended)
    : orderedWinnerOptions(recommended).filter((key) => key !== 'BY_POINTS');
  const selectedWinner = !allowByPoints && winnerOfGame === 'BY_POINTS' ? recommended : winnerOfGame;

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
          {visibleWinnerOptions.map((key) => {
            const label =
              key === 'BY_POINTS'
                ? t('gameResults.byPoints')
                : key === 'BY_MATCHES_WON'
                  ? t('gameResults.byMatchesWon')
                  : t('gameResults.byScoresDelta');
            const selected = selectedWinner === key;
            return (
              <button
                key={key}
                type="button"
                className={`w-full text-left flex items-center justify-between gap-2 ${pill(selected)}`}
                onClick={() => {
                  if (key === 'BY_POINTS') selectByPoints();
                  else onChange({ winnerOfGame: key });
                }}
                title={recommended === key ? t('gameFormat.recommended') : undefined}
              >
                <span>{label}</span>
                <RecommendDot show={recommended === key} selected={selected} />
              </button>
            );
          })}
        </div>
      </div>

      {allowByPoints && selectedWinner === 'BY_POINTS' && (
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
