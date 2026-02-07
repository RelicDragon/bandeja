import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Edit2, Undo2, Loader2 } from 'lucide-react';
import { Card, Button } from '@/components';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Game, User, GameOutcome } from '@/types';
import { EditLevelModal } from './EditLevelModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { usersApi } from '@/api/users';
import toast from 'react-hot-toast';

interface TrainingResultsSectionProps {
  game: Game;
  user: User | null;
  onUpdateParticipantLevel: (gameId: string, userId: string, level: number, reliability: number) => Promise<void>;
  onUndoTraining: (gameId: string) => Promise<void>;
}

export const TrainingResultsSection = ({
  game,
  user,
  onUpdateParticipantLevel,
  onUndoTraining,
}: TrainingResultsSectionProps) => {
  const { t } = useTranslation();
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [fullUserProfile, setFullUserProfile] = useState<User | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);

  const isTrainerOrOwner = game.participants?.some(p => p.userId === user?.id && (p.isTrainer || p.role === 'OWNER'));
  const canEdit = user && (isTrainerOrOwner || user.isAdmin) && game.status !== 'ARCHIVED';
  const hasChanges = game.outcomes && game.outcomes.length > 0;
  const canUndo = hasChanges && game.status !== 'ARCHIVED' && game.resultsStatus === 'FINAL';

  const trainingOwner = game.participants.find((p) => p.isTrainer || p.role === 'OWNER');
  const playingParticipants = game.participants.filter((p) => p.status === 'PLAYING' && p.user && !p.isTrainer && p.role !== 'OWNER');

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
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
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
                        <div className="text-sm text-gray-900 dark:text-white">
                          {[participant.user.firstName, participant.user.lastName]
                            .filter(Boolean)
                            .join(' ')}
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
