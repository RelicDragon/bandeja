import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, TrendingUp, TrendingDown } from 'lucide-react';
import { OutcomeExplanation } from '@/api/results';

interface OutcomeExplanationModalProps {
  explanation: OutcomeExplanation;
  playerName: string;
  levelBefore: number;
  onClose: () => void;
}

export const OutcomeExplanationModal = ({ explanation, playerName, levelBefore, onClose }: OutcomeExplanationModalProps) => {
  const { t } = useTranslation();

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const getLevelChangeColor = (change: number) => {
    if (change > 0) return 'text-green-600 dark:text-green-400';
    if (change < 0) return 'text-red-600 dark:text-red-400';
    return 'text-gray-600 dark:text-gray-400';
  };

  const getLevelChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp size={14} />;
    if (change < 0) return <TrendingDown size={14} />;
    return null;
  };

  const getDecimals = (value: number) => {
    if (value === 0) return 2;
    const absValue = Math.abs(value);
    if (absValue < 0.01) {
      return Math.ceil(-Math.log10(absValue)) + 1;
    }
    return 2;
  };

  const formatNumber = (value: number) => {
    return value.toFixed(getDecimals(value));
  };

  const formatChange = (change: number) => {
    const formatted = formatNumber(change);
    return change > 0 ? `+${formatted}` : formatted;
  };

  const formatPlayerNames = (players: Array<{ firstName?: string; lastName?: string }>) => {
    return players.map(p => `${p.firstName || ''} ${p.lastName || ''}`).join(', ');
  };

  const groupedMatches = explanation.matches.reduce((acc, match) => {
    if (!acc[match.roundNumber]) {
      acc[match.roundNumber] = [];
    }
    acc[match.roundNumber].push(match);
    return acc;
  }, {} as Record<number, typeof explanation.matches>);

  const sortedRounds = Object.keys(groupedMatches).map(Number).sort((a, b) => a - b);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 animate-fadeIn">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden animate-scaleIn">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {t('gameResults.explanationTitle')}: {playerName}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            <X size={20} className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(90vh-8rem)]">
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
              {t('gameResults.summary')}
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2">
                <span className="text-gray-600 dark:text-gray-400">{t('gameResults.level')}:</span>
                <span className="ml-2 font-semibold text-gray-900 dark:text-gray-100">
                  {levelBefore.toFixed(2)} → {formatNumber(levelBefore + explanation.levelChange)}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-600 dark:text-gray-400">{t('gameResults.winsLosses')}:</span>
                <span className="ml-2 font-semibold text-green-600 dark:text-green-400">
                  {explanation.summary.wins}W
                </span>
                <span className="mx-1">/</span>
                <span className="font-semibold text-red-600 dark:text-red-400">{explanation.summary.losses}L</span>
                {explanation.summary.draws > 0 && (
                  <>
                    <span className="mx-1">/</span>
                    <span className="font-semibold text-gray-600 dark:text-gray-400">
                      {explanation.summary.draws}D
                    </span>
                  </>
                )}
              </div>
              <div className="col-span-2">
                <span className="text-gray-600 dark:text-gray-400">{t('gameResults.avgOpponentLevel')}:</span>
                <span className="ml-2 font-semibold text-gray-900 dark:text-gray-100">
                  {formatNumber(explanation.summary.averageOpponentLevel)}
                </span>
              </div>
              <div className="col-span-2 mt-2 pt-2 border-t border-gray-300 dark:border-gray-600">
                <span className="text-gray-600 dark:text-gray-400">{t('gameResults.totalLevelChange')}:</span>
                <span className={`ml-2 font-bold text-lg ${getLevelChangeColor(explanation.levelChange)}`}>
                  {formatChange(explanation.levelChange)}
                </span>
              </div>
            </div>
          </div>

          <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
            {t('gameResults.matchByMatch')}
          </h3>
          <div className="space-y-6">
            {sortedRounds.map((roundNumber) => (
              <div key={roundNumber} className="space-y-3">
                {sortedRounds.length > 1 && (
                  <h4 className="text-md font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-300 dark:border-gray-600 pb-1">
                    {t('gameResults.round')} {roundNumber}
                  </h4>
                )}
                {groupedMatches[roundNumber].map((match, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border ${
                      match.isDraw
                        ? 'bg-gray-50 dark:bg-gray-700/20 border-gray-300 dark:border-gray-600'
                        : match.isWinner
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                          {t('gameResults.matchLabel')} #{match.matchNumber}
                        </span>
                        {match.sets && match.sets.length > 0 && (
                          <div className="flex gap-1.5">
                            {match.sets.map((set, setIndex) => (
                              <span
                                key={setIndex}
                                className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                  set.isWinner
                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                }`}
                              >
                                {set.userScore}-{set.opponentScore}
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
                      <span className="ml-1">{formatPlayerNames(match.teammates)}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">{t('gameResults.opponents')}:</span>
                    <span className="ml-1">{formatPlayerNames(match.opponents)}</span>
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
                        ({match.multiplier < 0.6 ? t('gameResults.veryClose') : match.multiplier < 1 ? t('gameResults.close') : match.multiplier > 2 ? t('gameResults.blowout') : t('gameResults.normal')})
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
                  {match.reliabilityCoefficient !== undefined && (
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">{t('gameResults.reliabilityCoefficient')}:</span>
                      <span className="ml-1 font-semibold text-blue-600 dark:text-blue-400">
                        {formatNumber(match.reliabilityCoefficient)}x
                      </span>
                    </div>
                  )}
                  {match.sets && match.sets.length > 0 && match.sets.some(s => s.levelChange !== 0) && (
                    <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600">
                      <span className="text-gray-600 dark:text-gray-400 text-xs font-semibold">{t('gameResults.sets')}:</span>
                      <div className="mt-1 space-y-1">
                        {match.sets.map((set, setIndex) => (
                          <div key={setIndex} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-700 dark:text-gray-300">
                                {t('gameResults.set')} {set.setNumber}:
                              </span>
                              <span className={`font-semibold ${set.isWinner ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {set.userScore} - {set.opponentScore}
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
                ))}
              </div>
            ))}
          </div>

          <div className="mt-6 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs text-blue-800 dark:text-blue-200">
              <strong>{t('gameResults.howItWorks')}:</strong> {t('gameResults.ratingExplanation')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

