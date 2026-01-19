import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Game, ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { PlayerAvatar } from './PlayerAvatar';
import { useState } from 'react';
import { gamesApi } from '@/api/games';
import { useAuthStore } from '@/store/authStore';
import { BaseModal } from '@/components/BaseModal';

interface ChatParticipantsModalProps {
  game: Game;
  onClose: () => void;
  onGuestLeave?: () => void;
  currentChatType?: ChatType;
}

export const ChatParticipantsModal = ({ game, onClose, onGuestLeave, currentChatType = 'PUBLIC' }: ChatParticipantsModalProps) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [isLeaving, setIsLeaving] = useState(false);
  const [isOpen, setIsOpen] = useState(true);

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const allParticipants = [
    ...game.participants.filter(p => p.isPlaying).map(p => ({ ...p.user, isParticipant: true, isInvited: false, isGuest: false, role: p.role })),
    ...game.participants.filter(p => !p.isPlaying).map(p => ({ ...p.user, isParticipant: false, isInvited: false, isGuest: p.role !== 'OWNER' && p.role !== 'ADMIN', role: p.role })),
    ...(game.invites || []).filter(invite => invite.receiver).map(invite => ({ ...invite.receiver!, isParticipant: false, isInvited: true, isGuest: false, role: 'PARTICIPANT' as const }))
  ];

  const isParticipantVisibleForChatType = (participant: any) => {
    const normalizedChatType = normalizeChatType(currentChatType);
    
    if (normalizedChatType === 'PUBLIC') {
      return true; // All participants are visible in public chat
    }
    
    if (normalizedChatType === 'ADMINS') {
      return participant.isParticipant && (participant.role === 'ADMIN' || participant.role === 'OWNER');
    }
    
    return true;
  };

  const isCurrentUserGuest = game.participants?.some(participant => participant.userId === user?.id && !participant.isPlaying && participant.role !== 'OWNER' && participant.role !== 'ADMIN') ?? false;

  const handleLeaveAsGuest = async () => {
    if (!game.id || isLeaving) return;
    
    setIsLeaving(true);
    try {
      await gamesApi.leave(game.id);
      onGuestLeave?.();
      handleClose();
    } catch (error) {
      console.error('Failed to leave as guest:', error);
    } finally {
      setIsLeaving(false);
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      isBasic
      modalId="chat-participants-modal"
      showCloseButton={false}
      closeOnBackdropClick={true}
    >
      <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 rounded-b-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('chat.participants')}
            </h2>
            <div className="flex items-center gap-2">
              {isCurrentUserGuest && (
                <button
                  onClick={handleLeaveAsGuest}
                  disabled={isLeaving}
                  className="px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLeaving ? t('app.loading') : t('chat.leave')}
                </button>
              )}
              <button
                onClick={handleClose}
                className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <X size={18} className="text-gray-600 dark:text-gray-300" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-3 space-y-2">
          {allParticipants.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-gray-600 dark:text-gray-400">{t('chat.noParticipants')}</p>
            </div>
          ) : (
            allParticipants.map((participant) => {
              const isVisibleForChat = isParticipantVisibleForChatType(participant);
              
              return (
                <div
                  key={participant.id}
                  className={`flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg ${!isVisibleForChat ? 'opacity-50' : ''}`}
                >
                  <div className={`flex-shrink-0 ${!isVisibleForChat ? 'grayscale' : ''}`}>
                    <PlayerAvatar 
                      player={participant}
                      smallLayout={true}
                      showName={false}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className={`text-sm font-medium truncate ${
                        isVisibleForChat ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'
                      }`}>
                        {participant.firstName} {participant.lastName}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {participant.role === 'OWNER' ? (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
                          isVisibleForChat 
                            ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400'
                            : 'bg-gray-100 dark:bg-gray-700/30 text-gray-500 dark:text-gray-500'
                        }`}>
                          {t('games.owner')}
                        </span>
                      ) : participant.role === 'ADMIN' ? (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
                          isVisibleForChat 
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
                            : 'bg-gray-100 dark:bg-gray-700/30 text-gray-500 dark:text-gray-500'
                        }`}>
                          {t('games.admin')}
                        </span>
                      ) : participant.isParticipant ? (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
                          isVisibleForChat 
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                            : 'bg-gray-100 dark:bg-gray-700/30 text-gray-500 dark:text-gray-500'
                        }`}>
                          {t('chat.participant')}
                        </span>
                      ) : participant.isGuest ? (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
                          isVisibleForChat 
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
                            : 'bg-gray-100 dark:bg-gray-700/30 text-gray-500 dark:text-gray-500'
                        }`}>
                          {t('chat.guest')}
                        </span>
                      ) : (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
                          isVisibleForChat 
                            ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400'
                            : 'bg-gray-100 dark:bg-gray-700/30 text-gray-500 dark:text-gray-500'
                        }`}>
                          {t('chat.invited')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
    </BaseModal>
  );
};
