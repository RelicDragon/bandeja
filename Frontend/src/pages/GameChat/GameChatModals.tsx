import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChatParticipantsModal } from '@/components/ChatParticipantsModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { DeclineInviteModal } from '@/components/DeclineInviteModal';
import { PlayerCardBottomSheet } from '@/components/PlayerCardBottomSheet';
import { useAuthStore } from '@/store/authStore';
import { useThreadChrome } from './useThreadView';

/** Thread modals — chrome seam only. */
export const GameChatModals: React.FC = () => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const {
    contextType,
    game,
    userChat,
    derived,
    panels,
    currentChatType,
    handleLeaveChat,
    handleDeclineInviteFromChat,
    leaveModalLabels,
    isLeavingChat,
    showLeaveConfirmation,
    setShowLeaveConfirmation,
    showDeclineInviteModal,
    setShowDeclineInviteModal,
  } = useThreadChrome();

  return (
    <>
      {contextType === 'GAME' && panels.showParticipantsModal && game && (
        <ChatParticipantsModal
          game={game}
          onClose={() => panels.setShowParticipantsModal(false)}
          currentChatType={currentChatType}
        />
      )}

      {contextType === 'USER' && (
        <PlayerCardBottomSheet
          playerId={
            panels.showPlayerCard && userChat && user?.id
              ? (userChat.user1Id === user.id ? userChat.user2Id : userChat.user1Id) ?? null
              : null
          }
          onClose={() => panels.setShowPlayerCard(false)}
        />
      )}

      {contextType === 'GAME' && (
        <DeclineInviteModal
          isOpen={showDeclineInviteModal}
          onClose={() => setShowDeclineInviteModal(false)}
          onDecline={handleDeclineInviteFromChat}
          isLoading={isLeavingChat}
        />
      )}

      {(contextType === 'GAME' || derived.isBugChat || contextType === 'GROUP') && (
        <ConfirmationModal
          isOpen={showLeaveConfirmation}
          title={contextType === 'GAME' ? leaveModalLabels.title : t('chat.leave')}
          message={contextType === 'GAME' ? leaveModalLabels.message : t('chat.leaveConfirmation')}
          confirmText={contextType === 'GAME' ? leaveModalLabels.confirmText : t('chat.leave')}
          cancelText={t('common.cancel')}
          confirmVariant="danger"
          onConfirm={handleLeaveChat}
          onClose={() => setShowLeaveConfirmation(false)}
        />
      )}
    </>
  );
};
