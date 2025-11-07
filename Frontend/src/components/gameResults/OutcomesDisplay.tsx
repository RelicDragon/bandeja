import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameOutcome } from '@/types';
import { Trophy, TrendingUp, TrendingDown, Award, HelpCircle } from 'lucide-react';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { OutcomeExplanationModal } from '@/components/OutcomeExplanationModal';
import { getOutcomeExplanation, OutcomeExplanation } from '@/api/results';

interface OutcomesDisplayProps {
  outcomes: GameOutcome[];
  affectsRating: boolean;
  gameId: string;
}

export const OutcomesDisplay = ({ outcomes, affectsRating, gameId }: OutcomesDisplayProps) => {
  const { t } = useTranslation();
  const [selectedExplanation, setSelectedExplanation] = useState<{
    explanation: OutcomeExplanation;
    playerName: string;
    levelBefore: number;
  } | null>(null);
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);

  const handleExplanationClick = async (outcome: GameOutcome) => {
    setLoadingUserId(outcome.userId);
    try {
      const explanation = await getOutcomeExplanation(gameId, outcome.userId);
      setSelectedExplanation({
        explanation,
        playerName: `${outcome.user.firstName} ${outcome.user.lastName}`,
        levelBefore: outcome.levelBefore,
      });
    } catch (error) {
      console.error('Failed to load explanation:', error);
    } finally {
      setLoadingUserId(null);
    }
  };

  const sortedOutcomes = [...outcomes].sort((a, b) => {
    if (a.position && b.position) return a.position - b.position;
    if (a.position && !b.position) return -1;
    if (!a.position && b.position) return 1;
    return b.pointsEarned - a.pointsEarned;
  });

  const getPositionIcon = (position?: number, isWinner?: boolean) => {
    if (isWinner || position === 1) {
      return <Trophy size={20} className="text-yellow-500" />;
    }
    if (position === 2) {
      return <Award size={20} className="text-gray-400" />;
    }
    if (position === 3) {
      return <Award size={20} className="text-amber-600" />;
    }
    return null;
  };

  const getLevelChangeColor = (change: number) => {
    if (change > 0) return 'text-green-600 dark:text-green-400';
    if (change < 0) return 'text-red-600 dark:text-red-400';
    return 'text-gray-600 dark:text-gray-400';
  };

  const getLevelChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp size={16} />;
    if (change < 0) return <TrendingDown size={16} />;
    return null;
  };

  const formatChange = (change: number) => {
    return change > 0 ? `+${change.toFixed(2)}` : change.toFixed(2);
  };

  return (
    <div className="container mx-auto px-4 py-6">
      {!affectsRating && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm text-yellow-800 dark:text-yellow-200 text-center">
            {t('gameResults.doesNotAffectRating')}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {sortedOutcomes.map((outcome, index) => (
          <div
            key={outcome.id}
            onClick={() => {
              if (loadingUserId !== outcome.userId) {
                handleExplanationClick(outcome);
              }
            }}
            className={`w-full relative bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 transition-all hover:shadow-lg active:scale-[1.02] text-left cursor-pointer ${
              loadingUserId === outcome.userId ? 'opacity-70 cursor-wait' : ''
            } ${outcome.isWinner ? 'ring-2 ring-yellow-500' : ''}`}
          >
            <div className="absolute top-3 right-3">
              {loadingUserId === outcome.userId ? (
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <HelpCircle size={20} className="text-gray-400 dark:text-gray-500" strokeWidth={1.5} />
              )}
            </div>

            <div className="flex items-center gap-3 pr-8">
              <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center">
                {outcome.position ? (
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                      {outcome.position}
                    </span>
                    {getPositionIcon(outcome.position, outcome.isWinner)}
                  </div>
                ) : (
                  <span className="text-xl text-gray-400">#{index + 1}</span>
                )}
              </div>

              <div className="flex-shrink-0">
                <PlayerAvatar
                  player={outcome.user}
                  smallLayout={true}
                  showName={false}
                />
              </div>

              <div className="flex-1 min-w-0 space-y-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {outcome.user.firstName} {outcome.user.lastName}
                </h3>
                
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    {outcome.levelBefore.toFixed(2)} → {outcome.levelAfter.toFixed(2)}
                  </span>
                  <span className={`flex items-center gap-1 font-semibold ${getLevelChangeColor(outcome.levelChange)}`}>
                    {getLevelChangeIcon(outcome.levelChange)}
                    {formatChange(outcome.levelChange)}
                  </span>
                </div>
                
                <div className="text-[0.65rem] text-gray-500 dark:text-gray-400">
                  {t('gameResults.reliability')}: {formatChange(outcome.reliabilityChange)}
                  {/* • {t('gameResults.points')}: {outcome.pointsEarned}*/}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedExplanation && (
        <OutcomeExplanationModal
          explanation={selectedExplanation.explanation}
          playerName={selectedExplanation.playerName}
          levelBefore={selectedExplanation.levelBefore}
          onClose={() => setSelectedExplanation(null)}
        />
      )}
    </div>
  );
};

