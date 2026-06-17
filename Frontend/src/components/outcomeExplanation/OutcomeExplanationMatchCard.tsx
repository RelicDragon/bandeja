import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { MatchExplanation } from '@/api/results';
import { formatChange, formatNumber, getLevelChangeColor } from './formatters';

type OutcomeExplanationMatchCardProps = {
  match: MatchExplanation;
  levelBefore: number;
};

const getLevelChangeIcon = (change: number) => {
  if (change > 0) return <TrendingUp size={14} />;
  if (change < 0) return <TrendingDown size={14} />;
  return null;
};

const renderPlayerNames = (
  players: Array<{ firstName?: string | null; lastName?: string | null; level: number }>,
  levelBefore: number,
) =>
  players.map((p, index) => {
    const firstName = p.firstName && p.firstName !== 'null' ? p.firstName : '';
    const lastName = p.lastName && p.lastName !== 'null' ? p.lastName : '';
    const name = `${firstName} ${lastName}`.trim();
    const levelColor =
      p.level > levelBefore
        ? 'text-green-600 dark:text-green-400'
        : p.level < levelBefore
          ? 'text-red-600 dark:text-red-400'
          : 'text-gray-600 dark:text-gray-400';

    return (
      <span key={index}>
        {name || 'Unknown'} <span className={`text-[10px] ${levelColor}`}>({formatNumber(p.level)})</span>
        {index < players.length - 1 && ', '}
      </span>
    );
  });

export const OutcomeExplanationMatchCard = memo(function OutcomeExplanationMatchCard({
  match,
  levelBefore,
}: OutcomeExplanationMatchCardProps) {
  const { t } = useTranslation();
  const isNf = !!match.notFinishedByRules;

  return (
    <div
      className={`p-3 rounded-lg border ${
        isNf
          ? 'bg-amber-50 dark:bg-amber-950/25 border-amber-200 dark:border-amber-800'
          : match.isDraw
            ? 'bg-gray-50 dark:bg-gray-700/20 border-gray-300 dark:border-gray-600'
            : match.isWinner
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      }`}
    >
      {isNf && (
        <p className="mb-2 text-xs font-medium text-amber-900 dark:text-amber-100 leading-snug">
          {t('gameResults.explanationMatchNotFinishedByRules')}
        </p>
      )}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            {t('gameResults.matchLabel')} #{match.matchNumber}
          </span>
          {match.sets && match.sets.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {match.sets.map((set, setIndex) => (
                <span
                  key={setIndex}
                  className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    isNf
                      ? 'bg-gray-100 dark:bg-gray-600/40 text-gray-700 dark:text-gray-200'
                      : set.isWinner
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                  }`}
                >
                  {set.userScore}-{set.opponentScore}
                  {set.isTieBreak && (
                    <span className="ml-1 text-[10px] font-bold text-primary-600 dark:text-primary-400">TB</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className={`flex items-center gap-1 font-semibold ${getLevelChangeColor(match.levelChange)}`}>
          {getLevelChangeIcon(match.levelChange)}
          {formatChange(match.levelChange)}
        </div>
      </div>

      <div className="text-xs space-y-1 text-gray-700 dark:text-gray-300">
        {match.teammates.length > 0 && (
          <div>
            <span className="text-gray-600 dark:text-gray-400">{t('gameResults.teammates')}:</span>
            <span className="ml-1">{renderPlayerNames(match.teammates, levelBefore)}</span>
          </div>
        )}
        <div>
          <span className="text-gray-600 dark:text-gray-400">{t('gameResults.opponents')}:</span>
          <span className="ml-1">{renderPlayerNames(match.opponents, levelBefore)}</span>
        </div>
        <div>
          <span className="text-gray-600 dark:text-gray-400">{t('gameResults.opponentLevel')}:</span>
          <span className="ml-1">{formatNumber(match.opponentLevel)}</span>
          <span className={`ml-2 ${getLevelChangeColor(match.levelDifference)}`}>
            ({formatChange(match.levelDifference)})
          </span>
        </div>
        {match.scoreDelta !== undefined && (
          <div>
            <span className="text-gray-600 dark:text-gray-400">{t('gameResults.scoreDelta')}:</span>
            <span className={`ml-1 font-semibold ${getLevelChangeColor(match.scoreDelta)}`}>
              {match.scoreDelta > 0 ? '+' : ''}
              {match.scoreDelta}
            </span>
          </div>
        )}
        {match.totalPointDifferential !== undefined && (
          <div>
            <span className="text-gray-600 dark:text-gray-400">{t('gameResults.pointDifferential')}:</span>
            <span className={`ml-1 font-semibold ${getLevelChangeColor(match.totalPointDifferential)}`}>
              {match.totalPointDifferential > 0 ? '+' : ''}
              {match.totalPointDifferential}
            </span>
          </div>
        )}
        {match.multiplier !== undefined && (
          <div>
            <span className="text-gray-600 dark:text-gray-400">{t('gameResults.multiplier')}:</span>
            <span className="ml-1 font-semibold text-purple-600 dark:text-purple-400">
              {formatNumber(match.multiplier)}x
            </span>
            <span className="ml-1 text-gray-500 dark:text-gray-400 text-[10px]">
              (
              {match.multiplier < 0.6
                ? t('gameResults.veryClose')
                : match.multiplier < 1
                  ? t('gameResults.close')
                  : match.multiplier > 2
                    ? t('gameResults.blowout')
                    : t('gameResults.normal')}
              )
            </span>
          </div>
        )}
        {match.enduranceCoefficient !== undefined && (
          <div>
            <span className="text-gray-600 dark:text-gray-400">{t('gameResults.endurance')}:</span>
            <span className="ml-1 font-semibold text-orange-600 dark:text-orange-400">
              {formatNumber(match.enduranceCoefficient)}x
            </span>
          </div>
        )}
        {match.sets && match.sets.length > 0 && match.sets.some((s) => s.levelChange !== 0) && (
          <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600">
            <span className="text-gray-600 dark:text-gray-400 text-xs font-semibold">{t('gameResults.sets')}:</span>
            <div className="mt-1 space-y-1">
              {match.sets.map((set, setIndex) => (
                <div key={setIndex} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-700 dark:text-gray-300">
                      {t('gameResults.set')} {set.setNumber}:
                    </span>
                    <span
                      className={`font-semibold ${set.isWinner ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                    >
                      {set.userScore} - {set.opponentScore}
                      {set.isTieBreak && (
                        <span className="ml-1 text-[10px] font-bold text-primary-600 dark:text-primary-400">TB</span>
                      )}
                    </span>
                  </div>
                  <span className={`font-semibold ${getLevelChangeColor(set.levelChange)}`}>
                    {formatChange(set.levelChange)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
