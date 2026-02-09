import React from 'react';
import { useTranslation } from 'react-i18next';
import { LogOut, Bell, BellOff } from 'lucide-react';
import { ChatParticipantsButton } from '@/components/ChatParticipantsButton';
import { Game } from '@/types';

interface ChatHeaderActionsProps {
  showMute: boolean;
  showLeave: boolean;
  showParticipantsButton: boolean;
  isMuted: boolean;
  isTogglingMute: boolean;
  onToggleMute: () => void;
  onLeaveClick: () => void;
  leaveTitle: string;
  game: Game | null;
  onParticipantsClick: () => void;
}

export const ChatHeaderActions: React.FC<ChatHeaderActionsProps> = ({
  showMute,
  showLeave,
  showParticipantsButton,
  isMuted,
  isTogglingMute,
  onToggleMute,
  onLeaveClick,
  leaveTitle,
  game,
  onParticipantsClick,
}) => {
  const { t } = useTranslation();

  if (!showMute && !showLeave && !showParticipantsButton) return null;

  return (
    <div className="flex items-center gap-2">
      {showMute && (
        <button
          onClick={onToggleMute}
          disabled={isTogglingMute}
          className={`p-2 rounded-lg transition-colors ${
            isMuted
              ? 'hover:bg-orange-100 dark:hover:bg-orange-900/20'
              : 'hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
          title={isMuted ? t('chat.unmute', { defaultValue: 'Unmute chat' }) : t('chat.mute', { defaultValue: 'Mute chat' })}
        >
          {isMuted ? (
            <BellOff size={20} className="text-orange-600 dark:text-orange-400" />
          ) : (
            <Bell size={20} className="text-gray-600 dark:text-gray-400" />
          )}
        </button>
      )}
      {showLeave && (
        <button
          onClick={onLeaveClick}
          className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
          title={leaveTitle}
        >
          <LogOut size={20} className="text-red-600 dark:text-red-400" />
        </button>
      )}
      {showParticipantsButton && game && (
        <ChatParticipantsButton game={game} onClick={onParticipantsClick} />
      )}
    </div>
  );
};
