import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OutcomeExplanation } from '@/api/results';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { OutcomeExplanationMatchCard } from '@/components/outcomeExplanation/OutcomeExplanationMatchCard';
import { RatingExplanationLlmSection } from '@/components/outcomeExplanation/RatingExplanationLlmSection';
import { formatChange, formatNumber, getLevelChangeColor, groupMatchesByRound } from '@/components/outcomeExplanation/formatters';
import { useAuthStore } from '@/store/authStore';
import { ratingUncertaintyScale } from '@/utils/ratingUncertainty';

interface OutcomeExplanationModalProps {
  explanation: OutcomeExplanation;
  playerName: string;
  levelBefore: number;
  gameId: string;
  affectsRating: boolean;
  onClose: () => void;
}

const OutcomeExplanationModalInner = ({
  explanation,
  playerName,
  levelBefore,
  gameId,
  affectsRating,
  onClose,
}: OutcomeExplanationModalProps) => {
  const { t } = useTranslation();
  const isAdmin = Boolean(useAuthStore((s) => s.user)?.isAdmin);
  const [isOpen, setIsOpen] = useState(true);
  const modalIdRef = useRef('outcome-explanation-modal');

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setTimeout(() => {
      onClose();
    }, 300);
  }, [onClose]);

  const { grouped: groupedMatches, sortedRounds } = useMemo(
    () => groupMatchesByRound(explanation.matches),
    [explanation.matches],
  );

  return (
    <Dialog open={isOpen} onClose={handleClose} modalId={modalIdRef.current}>
      <DialogContent ignoreOutsideClickSelector="[data-rating-explanation-lang-menu]">
        <DialogHeader>
          <DialogTitle>
            {t('gameResults.explanationTitle')}: {playerName && playerName !== 'null' ? playerName : 'Unknown'}
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 overflow-y-auto overscroll-y-contain max-h-[calc(90vh-8rem)]">
          {affectsRating && (
            <RatingExplanationLlmSection gameId={gameId} userId={explanation.userId} />
          )}

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
              {explanation.placementRatingFloor?.applied && (
                <div className="col-span-2 mt-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100 text-sm leading-snug">
                  <p className="font-semibold mb-1">{t('gameResults.placementRatingFloorTitle')}</p>
                  <p>
                    {t('gameResults.placementRatingFloorBody', {
                      uncapped: formatChange(explanation.placementRatingFloor.uncappedLevelChange),
                      applied: formatChange(explanation.levelChange),
                    })}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-gray-600 dark:text-gray-400">{t('gameResults.reliability')}:</span>
                <span className="ml-1.5 font-semibold text-gray-900 dark:text-gray-100">
                  {formatNumber(explanation.userReliability)} →{' '}
                  {formatNumber(explanation.userReliability + explanation.reliabilityChange)}
                </span>
                <span className={`ml-1.5 font-semibold ${getLevelChangeColor(explanation.reliabilityChange)}`}>
                  ({formatChange(explanation.reliabilityChange)})
                </span>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">{t('gameResults.reliabilityCoefficient')}:</span>
                <span className="ml-1.5 font-semibold text-purple-600 dark:text-purple-400">
                  {formatNumber(explanation.reliabilityCoefficient)}x
                </span>
                {explanation.ratingSettling && (
                  <span className="ml-2 inline-flex items-center rounded-md bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200">
                    {t('gameResults.ratingSettling')}
                  </span>
                )}
              </div>
              {isAdmin && explanation.ratingUncertainty != null && explanation.ratingUncertainty > 0 && (
                <div>
                  <span className="text-gray-600 dark:text-gray-400">{t('gameResults.ratingUncertainty')}:</span>
                  <span className="ml-1.5 font-semibold text-amber-700 dark:text-amber-300">
                    {formatNumber(explanation.ratingUncertainty)} (
                    {formatNumber(ratingUncertaintyScale(explanation.ratingUncertainty))}x)
                  </span>
                </div>
              )}
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
                {groupedMatches[roundNumber].map((match) => (
                  <OutcomeExplanationMatchCard
                    key={`${roundNumber}-${match.matchNumber}`}
                    match={match}
                    levelBefore={levelBefore}
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="mt-6 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs text-blue-800 dark:text-blue-200">
              <strong>{t('gameResults.howItWorks')}:</strong> {t('gameResults.ratingExplanation')}
            </p>
          </div>

          {explanation.socialLevelChange && (
            <div className="mt-6 space-y-4">
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <h3 className="text-lg font-semibold mb-3 text-amber-900 dark:text-amber-100">
                  {t('gameResults.socialLevelChange')}
                </h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-amber-800 dark:text-amber-200">{t('gameResults.socialLevelBefore')}:</span>
                    <span className="ml-2 font-semibold text-amber-900 dark:text-amber-100">
                      {formatNumber(explanation.socialLevelChange.levelBefore)} →{' '}
                      {formatNumber(explanation.socialLevelChange.levelAfter)}
                    </span>
                    <span
                      className={`ml-2 font-bold text-lg ${getLevelChangeColor(explanation.socialLevelChange.levelChange)}`}
                    >
                      {formatChange(explanation.socialLevelChange.levelChange)}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-amber-300 dark:border-amber-700">
                    <div className="mb-2">
                      <span className="text-amber-800 dark:text-amber-200">{t('gameResults.baseBoost')}:</span>
                      <span className="ml-2 font-semibold text-amber-900 dark:text-amber-100">
                        {formatChange(explanation.socialLevelChange.baseBoost)}
                      </span>
                    </div>
                    <div className="mb-2">
                      <span className="text-amber-800 dark:text-amber-200">{t('gameResults.roleMultiplier')}:</span>
                      <span className="ml-2 font-semibold text-purple-600 dark:text-purple-400">
                        {formatNumber(explanation.socialLevelChange.roleMultiplier)}x
                      </span>
                      <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">
                        ({explanation.socialLevelChange.roleName})
                      </span>
                    </div>
                    <div className="mb-2">
                      <span className="text-amber-800 dark:text-amber-200">{t('gameResults.totalSocialLevelChange')}:</span>
                      <span
                        className={`ml-2 font-bold text-lg ${getLevelChangeColor(explanation.socialLevelChange.levelChange)}`}
                      >
                        {formatChange(explanation.socialLevelChange.levelChange)}
                      </span>
                      <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">
                        ({formatChange(explanation.socialLevelChange.baseBoost)} ×{' '}
                        {formatNumber(explanation.socialLevelChange.roleMultiplier)})
                      </span>
                    </div>
                  </div>

                  {explanation.socialLevelChange.participantBreakdown.length > 0 && (
                    <div className="pt-2 border-t border-amber-300 dark:border-amber-700">
                      <div className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-2">
                        {t('gameResults.socialLevelBreakdown')}:
                      </div>
                      <div className="space-y-1">
                        {explanation.socialLevelChange.participantBreakdown.map((participant, index) => (
                          <div key={index} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-amber-700 dark:text-amber-300">{participant.participantName}</span>
                              <span className="text-amber-600 dark:text-amber-400 text-[10px]">
                                ({t('gameResults.gamesPlayedTogether', { count: participant.gamesPlayedTogether })})
                              </span>
                            </div>
                            <span className={`font-semibold ${getLevelChangeColor(participant.boost)}`}>
                              {formatChange(participant.boost)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  <strong>{t('gameResults.howItWorks')}:</strong> {t('gameResults.socialLevelExplanation')}
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const OutcomeExplanationModal = memo(OutcomeExplanationModalInner);
