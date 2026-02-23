import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Edit2, Undo2, Loader2, Star } from 'lucide-react';
import { Card, Button } from '@/components';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Game, User, GameOutcome, TrainerReview } from '@/types';
import { formatDate } from '@/utils/dateFormat';
import { EditLevelModal } from './EditLevelModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { usersApi } from '@/api/users';
import { trainingApi } from '@/api/training';
import toast from 'react-hot-toast';

interface TrainingResultsSectionProps {
  game: Game;
  user: User | null;
  onUpdateParticipantLevel: (gameId: string, userId: string, level: number, reliability: number) => Promise<void>;
  onUndoTraining: (gameId: string) => Promise<void>;
  onReviewSubmitted?: () => void;
}

export const TrainingResultsSection = ({
  game,
  user,
  onUpdateParticipantLevel,
  onUndoTraining,
  onReviewSubmitted,
}: TrainingResultsSectionProps) => {
  const { t } = useTranslation();
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [fullUserProfile, setFullUserProfile] = useState<User | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [myReview, setMyReview] = useState<TrainerReview | null | undefined>(undefined);
  const [editingReview, setEditingReview] = useState(false);
  const [loadingMyReview, setLoadingMyReview] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewStars, setReviewStars] = useState(0);
  const [reviewText, setReviewText] = useState('');

  const isReviewEdited = (r: TrainerReview) =>
    r.updatedAt && new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime() > 2000;

  const isTrainerOrOwner = game.participants?.some(p => p.userId === user?.id && (game.trainerId === p.userId || p.role === 'OWNER'));
  const canEdit = user && (isTrainerOrOwner || user.isAdmin) && game.status !== 'ARCHIVED';
  const hasChanges = game.outcomes && game.outcomes.length > 0;
  const canUndo = hasChanges && game.status !== 'ARCHIVED' && game.resultsStatus === 'FINAL';

  const canLeaveReview =
    user &&
    game.trainerId &&
    user.id !== game.trainerId &&
    game.participants?.some((p) => p.userId === user.id && p.status === 'PLAYING');

  useEffect(() => {
    if (!canLeaveReview || !game.id) return;
    let cancelled = false;
    setLoadingMyReview(true);
    trainingApi
      .getMyReview(game.id)
      .then((res) => {
        if (cancelled) return;
        if (res.data != null) setMyReview(res.data);
        else setMyReview(null);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error(t('errors.generic', { defaultValue: 'Something went wrong. Please try again.' }));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMyReview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [game.id, canLeaveReview, t]);

  const handleSubmitReview = async () => {
    if (reviewStars < 1 || reviewStars > 5) {
      toast.error(t('training.selectStars', { defaultValue: 'Please select a rating (1-5 stars)' }));
      return;
    }
    setSubmittingReview(true);
    try {
      const res = await trainingApi.submitReview(game.id, reviewStars, reviewText.trim() || undefined);
      setMyReview(res.data!.review);
      setEditingReview(false);
      onReviewSubmitted?.();
      toast.success(
        myReview != null
          ? t('training.reviewUpdated', { defaultValue: 'Review updated' })
          : t('training.reviewSubmitted', { defaultValue: 'Thank you for your review!' })
      );
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ? t(msg, { defaultValue: msg }) : t('errors.generic'));
    } finally {
      setSubmittingReview(false);
    }
  };

  const startEditReview = () => {
    if (myReview) {
      setReviewStars(myReview.stars);
      setReviewText(myReview.text?.trim() ?? '');
      setEditingReview(true);
    }
  };

  const trainingOwner = (game.trainerId ? game.participants.find((p) => p.userId === game.trainerId) : null) || game.participants.find((p) => p.role === 'OWNER');
  const playingParticipants = game.participants.filter((p) => p.status === 'PLAYING' && p.user && p.role !== 'OWNER');

  const handleEdit = async (participantUserId: string) => {
    setEditingUserId(participantUserId);
    setLoadingUser(true);
    try {
      const response = await usersApi.getUserStats(participantUserId);
      if (response.data?.user) {
        setFullUserProfile(response.data.user);
      }
    } catch (error: any) {
      console.error('Failed to load user profile:', error);
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
      setEditingUserId(null);
    } finally {
      setLoadingUser(false);
    }
  };

  const handleSaveLevel = async (participantUserId: string, level: number, reliability: number) => {
    await onUpdateParticipantLevel(game.id, participantUserId, level, reliability);
    setEditingUserId(null);
  };

  const handleUndo = async () => {
    setUndoing(true);
    try {
      await onUndoTraining(game.id);
      setShowUndoConfirm(false);
    } catch (error) {
      console.error('Failed to undo training:', error);
    } finally {
      setUndoing(false);
    }
  };

  const getParticipantOutcome = (userId: string): GameOutcome | undefined => {
    return game.outcomes?.find((o) => o.userId === userId);
  };

  return (
    <>
      <Card>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="section-title">
            {t('training.trainingResults')}
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 pl-4 pr-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                  {t('gameDetails.player')}
                </th>
                <th className="text-center py-3 px-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                  {t('training.rating')}
                </th>
                {canEdit && (
                  <th className="text-center py-3 px-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {t('training.actions', { defaultValue: 'Actions' })}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {playingParticipants.map((participant) => {
                if (!participant.user) return null;

                const outcome = getParticipantOutcome(participant.userId);
                const currentLevel = outcome ? outcome.levelAfter : participant.user.level;

                return (
                  <tr
                    key={participant.userId}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td className="py-3 pl-4 pr-2">
                      <div className="flex items-center gap-3">
                        <PlayerAvatar
                          player={participant.user}
                          extrasmall={true}
                          showName={false}
                          fullHideName={true}
                        />
                        <div>
                          <div className="text-sm text-gray-900 dark:text-white">
                            {[participant.user.firstName, participant.user.lastName]
                              .filter(Boolean)
                              .join(' ')}
                          </div>
                          {participant.user.verbalStatus && (
                            <p className="verbal-status">
                              {participant.user.verbalStatus}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {outcome && (outcome.levelChange !== 0 || outcome.reliabilityChange !== 0) ? (
                          <>
                            {outcome.levelChange !== 0 && (
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {t('training.level')}: {outcome.levelBefore.toFixed(1)} → {outcome.levelAfter.toFixed(1)}
                              </div>
                            )}
                            {outcome.reliabilityChange !== 0 && (
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {t('training.reliability')}: {outcome.reliabilityBefore.toFixed(1)} → {outcome.reliabilityAfter.toFixed(1)}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {currentLevel.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </td>
                    {canEdit && trainingOwner && trainingOwner.userId !== participant.userId && (
                      <td className="py-3 px-2 text-center">
                        <button
                          onClick={() => handleEdit(participant.userId)}
                          className="p-2 text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                          title={t('training.edit')}
                        >
                          <Edit2 size={18} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {canUndo && canEdit && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <Button
              onClick={() => setShowUndoConfirm(true)}
              variant="danger"
              size="md"
              disabled={undoing}
              className="w-full flex items-center justify-center"
            >
              {undoing ? (
                <>
                  <Loader2 size={18} className="animate-spin mr-2" />
                  {t('common.loading')}
                </>
              ) : (
                <>
                  <Undo2 size={18} className="mr-2" />
                  {t('training.undoTraining')}
                </>
              )}
            </Button>
          </div>
        )}
      </Card>

      {canLeaveReview && (
        <Card className="mt-4">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="section-title">
              {t('training.rateThisTraining', { defaultValue: 'Rate this training' })}
            </h2>
          </div>
          <div className="p-4">
            {loadingMyReview ? (
              <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 py-4">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">{t('common.loading')}</span>
              </div>
            ) : myReview != null && !editingReview ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <Star size={18} className="fill-current" />
                  <span className="font-medium">
                    {t('training.youRated', { count: myReview.stars, stars: myReview.stars })}
                  </span>
                </div>
                {myReview.text?.trim() && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    {myReview.text.trim()}
                  </p>
                )}
                {isReviewEdited(myReview) && myReview.updatedAt && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {t('training.edited', { defaultValue: 'Edited' })} {formatDate(myReview.updatedAt, 'PPp')}
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={startEditReview}
                  className="self-start inline-flex items-center gap-2 rounded-xl px-3 py-2 -ml-1 text-primary-600 hover:text-primary-700 hover:bg-primary-50 dark:text-primary-400 dark:hover:text-primary-300 dark:hover:bg-primary-900/20 focus:ring-2 focus:ring-primary-500/30"
                >
                  <Edit2 size={16} className="shrink-0" />
                  {t('training.editReview', { defaultValue: 'Edit review' })}
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1 mb-4">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setReviewStars(s)}
                      className="p-1.5 rounded-lg transition-all duration-200 hover:bg-amber-50 dark:hover:bg-amber-950/30 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900"
                      aria-label={`${s} stars`}
                    >
                      <Star
                        size={28}
                        className={`transition-colors ${reviewStars >= s ? 'fill-amber-500 text-amber-500' : 'text-gray-300 dark:text-gray-600 hover:text-amber-400/70 dark:hover:text-amber-500/50'}`}
                      />
                    </button>
                  ))}
                </div>
                <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value.slice(0, 1000))}
                  placeholder={t('training.reviewTextPlaceholder', { defaultValue: 'Optional comment (max 1000 characters)' })}
                  className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-800/80 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 mb-4 min-h-[88px] focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 dark:focus:ring-primary-400/40 transition-shadow resize-none"
                  maxLength={1000}
                  rows={3}
                />
                <div className="flex gap-3">
                  {editingReview && (
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={() => setEditingReview(false)}
                      className="flex-1 rounded-xl min-h-[44px]"
                    >
                      {t('common.cancel')}
                    </Button>
                  )}
                  <Button
                    onClick={handleSubmitReview}
                    disabled={submittingReview}
                    variant="primary"
                    size="md"
                    className={`rounded-xl min-h-[44px] inline-flex items-center justify-center ${editingReview ? 'flex-1' : 'w-full'}`}
                  >
                    {submittingReview ? (
                      <>
                        <Loader2 size={18} className="animate-spin shrink-0 mr-2" />
                        {t('common.loading')}
                      </>
                    ) : myReview != null ? (
                      t('training.updateReview', { defaultValue: 'Save changes' })
                    ) : (
                      t('training.submitReview', { defaultValue: 'Submit review' })
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>
      )}

      {editingUserId && (() => {
        const participant = playingParticipants.find((p) => p.userId === editingUserId);
        if (!participant?.user) return null;

        if (loadingUser || !fullUserProfile) {
          return createPortal(
            <div className="fixed inset-0 z-[9999] bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4">
              <Card className="w-full max-w-lg p-6">
                <div className="flex items-center justify-center gap-3">
                  <Loader2 className="animate-spin h-6 w-6 text-primary-600" />
                  <span className="text-gray-700 dark:text-gray-300">{t('common.loading')}</span>
                </div>
              </Card>
            </div>,
            document.body
          );
        }

        const outcome = getParticipantOutcome(editingUserId);
        const originalLevel = outcome ? outcome.levelBefore : fullUserProfile.level;
        const originalReliability = outcome ? outcome.reliabilityBefore : fullUserProfile.reliability;

        return (
          <EditLevelModal
            isOpen={true}
            onClose={() => {
              setEditingUserId(null);
              setFullUserProfile(null);
            }}
            user={fullUserProfile}
            currentLevel={originalLevel}
            currentReliability={originalReliability}
            onSave={(level, reliability) => handleSaveLevel(editingUserId, level, reliability)}
          />
        );
      })()}

      <ConfirmationModal
        isOpen={showUndoConfirm}
        title={t('training.undoTraining')}
        message={t('training.undoTrainingConfirm', {
          defaultValue: 'Are you sure you want to undo all training changes? This will revert all level and reliability changes.',
        })}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        onConfirm={handleUndo}
        onClose={() => setShowUndoConfirm(false)}
      />
    </>
  );
};
