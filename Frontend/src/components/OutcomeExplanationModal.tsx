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

  const formatChange = (change: number) => {
    return change > 0 ? `+${change.toFixed(2)}` : change.toFixed(2);
  };

  const formatPlayerNames = (players: Array<{ firstName?: string; lastName?: string }>) => {
    return players.map(p => `${p.firstName || ''} ${p.lastName || ''}`).join(', ');
  };

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
                  {levelBefore.toFixed(2)} → {(levelBefore + explanation.levelChange).toFixed(2)}
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
                  {explanation.summary.averageOpponentLevel.toFixed(2)}
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
          <div className="space-y-3">
            {explanation.matches.map((match, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg border ${
                  match.isWinner
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      {t('gameResults.matchLabel')} #{match.matchNumber}
                    </span>
                    <span className="text-xs text-gray-600 dark:text-gray-400 ml-2">
                      ({t('gameResults.round')} {match.roundNumber})
                    </span>
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
                    <span className="ml-1">{match.opponentLevel.toFixed(2)}</span>
                    <span className={`ml-2 ${getLevelChangeColor(match.levelDifference)}`}>
                      ({match.levelDifference > 0 ? '+' : ''}
                      {match.levelDifference.toFixed(2)})
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
                        {match.multiplier.toFixed(2)}x
                      </span>
                      <span className="ml-1 text-gray-500 dark:text-gray-400 text-[10px]">
                        ({match.multiplier < 0.6 ? t('gameResults.veryClose') : match.multiplier < 1 ? t('gameResults.close') : match.multiplier > 2 ? t('gameResults.blowout') : t('gameResults.normal')})
                      </span>
                    </div>
                  )}
                </div>
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

