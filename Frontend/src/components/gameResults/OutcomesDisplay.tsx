import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { GameOutcome } from '@/types';
import { Trophy, TrendingUp, TrendingDown, Award, HelpCircle, ChevronUp, ChevronDown } from 'lucide-react';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { OutcomeExplanationModal } from '@/components/OutcomeExplanationModal';
import { getOutcomeExplanation, OutcomeExplanation } from '@/api/results';

interface OutcomesDisplayProps {
  outcomes: GameOutcome[];
  affectsRating: boolean;
  gameId: string;
}

type DisplayMode = 'ratings' | 'stats';

export const OutcomesDisplay = ({ outcomes, affectsRating, gameId }: OutcomesDisplayProps) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<DisplayMode>('ratings');
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

  const getScoresDeltaIcon = (delta: number) => {
    if (delta > 0) return <ChevronUp size={16} />;
    if (delta < 0) return <ChevronDown size={16} />;
    return null;
  };

  const formatChange = (change: number) => {
    return change > 0 ? `+${change.toFixed(2)}` : change.toFixed(2);
  };

  const formatScoresDelta = (delta: number) => {
    return delta > 0 ? `+${delta}` : delta.toString();
  };

  const scoresDelta = (made: number, lost: number) => {
    return made - lost;
  };

  return (
    <div className="container mx-auto px-4 py-2">
      {!affectsRating && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm text-yellow-800 dark:text-yellow-200 text-center">
            {t('gameResults.doesNotAffectRating')}
          </p>
        </div>
      )}

      <div className="mb-4 flex justify-center">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-1">
          <button
            onClick={() => setMode('ratings')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              mode === 'ratings'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            {t('gameResults.ratings')}
          </button>
          <button
            onClick={() => setMode('stats')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              mode === 'stats'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            {t('gameResults.stats')}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {sortedOutcomes.map((outcome, index) => (
          <div
            key={outcome.id}
            onClick={() => {
              if (loadingUserId !== outcome.userId) {
                handleExplanationClick(outcome);
              }
            }}
            className={`w-full relative bg-white dark:bg-gray-800 rounded-lg shadow-md p-2.5 transition-all hover:shadow-lg active:scale-[1.02] text-left cursor-pointer ${
              loadingUserId === outcome.userId ? 'opacity-70 cursor-wait' : ''
            } ${outcome.isWinner ? 'ring-2 ring-yellow-500' : ''}`}
          >
            <div className="absolute top-2 right-2">
              {loadingUserId === outcome.userId ? (
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <HelpCircle size={20} className="text-gray-400 dark:text-gray-500" strokeWidth={1.5} />
              )}
            </div>

            <div className="flex items-center gap-2 pr-7">
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

              <div className="flex-1 min-w-0 space-y-0 relative">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate mb-0.5">
                  {outcome.user.firstName} {outcome.user.lastName}
                </h3>
                
                <div className="relative min-h-[2.5rem]">
                  <AnimatePresence mode="wait">
                    {mode === 'ratings' ? (
                      <motion.div
                        key="ratings"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 flex flex-col gap-1"
                      >
                        <div className="flex items-center gap-2 text-sm flex-wrap">
                          <span className="text-gray-600 dark:text-gray-400">
                            {outcome.levelBefore.toFixed(2)} → {outcome.levelAfter.toFixed(2)}
                          </span>
                          <span className={`flex items-center gap-1 font-semibold ${getLevelChangeColor(outcome.levelChange)}`}>
                            {getLevelChangeIcon(outcome.levelChange)}
                            {formatChange(outcome.levelChange)}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {t('gameResults.reliability')}: {formatChange(outcome.reliabilityChange)}
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="stats"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 flex flex-col gap-1"
                      >
                        <div className="flex items-center gap-2 text-sm flex-wrap">
                          <span className="text-gray-600 dark:text-gray-400">
                            {t('gameResults.games')}: {outcome.wins}-{outcome.ties}-{outcome.losses}
                          </span>
                          <span className="text-gray-400 dark:text-gray-500">•</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {t('gameResults.points')}: {outcome.pointsEarned}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm flex-wrap">
                          <span className="text-gray-600 dark:text-gray-400">
                            {t('gameResults.scores')}: {outcome.scoresMade}-{outcome.scoresLost}
                          </span>
                          <span className={`flex items-center gap-1 font-semibold ${getLevelChangeColor(scoresDelta(outcome.scoresMade, outcome.scoresLost))}`}>
                            {getScoresDeltaIcon(scoresDelta(outcome.scoresMade, outcome.scoresLost))}
                            {formatScoresDelta(scoresDelta(outcome.scoresMade, outcome.scoresLost))}
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
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

