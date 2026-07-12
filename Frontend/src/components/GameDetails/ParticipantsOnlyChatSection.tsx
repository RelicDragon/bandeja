import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquarePlus } from 'lucide-react';
import { Card, ConfirmationModal } from '@/components';
import type { Game } from '@/types';
import { gamesApi } from '@/api/games';
import { isUserGameAdminOrOwner } from '@/utils/gameResults';
import { useParticipantChatsEnabled } from '@/hooks/useParticipantChatsEnabled';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import toast from 'react-hot-toast';

interface ParticipantsOnlyChatSectionProps {
  game: Game;
  userId: string;
}

export const ParticipantsOnlyChatSection = ({ game, userId }: ParticipantsOnlyChatSectionProps) => {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const { isLoading, bothEnabled, refresh } = useParticipantChatsEnabled(game.id);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const canManage =
    isUserGameAdminOrOwner(game, userId) &&
    game.status !== 'ARCHIVED' &&
    game.entityType !== 'BAR' &&
    game.entityType !== 'TRAINING';

  const visible =
    canManage && game.resultsStatus === 'NONE' && !isLoading && !bothEnabled && !dismissed;

  const handleConfirm = async () => {
    setIsEnabling(true);
    try {
      await gamesApi.enableParticipantChats(game.id);
      refresh();
      setShowConfirm(false);
      setDismissed(true);
      toast.success(t('gameDetails.participantsOnlyChat.successToast'));
    } catch {
      toast.error(t('gameDetails.participantsOnlyChat.errorToast'));
    } finally {
      setIsEnabling(false);
    }
  };

  return (
    <>
      <AnimatePresence initial={false}>
        {visible && (
          <motion.div
            key="participants-only-chat-section"
            id="participants-only-chat-section"
            initial={reduceMotion ? false : { opacity: 1, height: 'auto' }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, height: 0, marginTop: 0, marginBottom: 0, overflow: 'hidden' }
            }
            transition={{ duration: reduceMotion ? 0.15 : 0.35, ease: 'easeInOut' }}
          >
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <MessageSquarePlus size={20} className="text-primary-600 dark:text-primary-400" />
                <h2 className="section-title">{t('gameDetails.participantsOnlyChat.title')}</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {t('gameDetails.participantsOnlyChat.description')}
              </p>
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-700 transition-colors"
              >
                {t('gameDetails.participantsOnlyChat.enableButton')}
              </button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => void handleConfirm()}
        title={t('gameDetails.participantsOnlyChat.confirmTitle')}
        message={t('gameDetails.participantsOnlyChat.confirmMessage', {
          participantsChat: t('chat.types.PRIVATE'),
          adminsChat: t('chat.types.ADMINS'),
        })}
        confirmText={t('gameDetails.participantsOnlyChat.confirmButton')}
        isLoading={isEnabling}
        closeOnConfirm={false}
      />
    </>
  );
};
