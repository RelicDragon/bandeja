import { useTranslation } from 'react-i18next';
import { Game, GameParticipant, ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { isParticipantPlaying } from '@/utils/participantStatus';
import { PlayerAvatar } from './PlayerAvatar';
import { useState, useEffect } from 'react';
import { gamesApi } from '@/api/games';
import { chatApi } from '@/api/chat';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';

interface ChatParticipantsModalProps {
  game: Game;
  onClose: () => void;
  currentChatType?: ChatType;
}

export const ChatParticipantsModal = ({ game: initialGame, onClose, currentChatType = 'PUBLIC' }: ChatParticipantsModalProps) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(true);
  const [participants, setParticipants] = useState<GameParticipant[]>(initialGame.participants ?? []);

  useEffect(() => {
    chatApi.getGameParticipants(initialGame.id)
      .then(setParticipants)
      .catch(() => {
        gamesApi.getById(initialGame.id).then(res => setParticipants(res.data.participants ?? [])).catch(() => {});
      });
  }, [initialGame.id]);

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const allParticipants = [
    ...participants.filter(isParticipantPlaying).map(p => ({ ...p.user, isParticipant: true, isInvited: false, isGuest: false, role: p.role })),
    ...participants.filter(p => !isParticipantPlaying(p)).map(p => ({ ...p.user, isParticipant: false, isInvited: p.status === 'INVITED', isGuest: p.status === 'GUEST' || (p.role !== 'OWNER' && p.role !== 'ADMIN'), role: p.role }))
  ];

  const isParticipantVisibleForChatType = (participant: any) => {
    const normalizedChatType = normalizeChatType(currentChatType);
    
    if (normalizedChatType === 'PUBLIC') {
      return true; // All participants are visible in public chat
    }
    
    if (normalizedChatType === 'PRIVATE') {
      return participant.isParticipant;
    }
    
    if (normalizedChatType === 'ADMINS') {
      return participant.isParticipant && (participant.role === 'ADMIN' || participant.role === 'OWNER');
    }
    
    return true;
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} modalId="chat-participants-modal">
      <DialogContent>
      <div className="flex flex-col h-full max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{t('chat.participants')}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto scrollbar-auto p-3 space-y-2">
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
                      fullHideName={true}
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
      </div>
      </DialogContent>
    </Dialog>
  );
};
