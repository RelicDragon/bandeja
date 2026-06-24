import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Game } from '@/types';
import { isPendingGameInvite } from '@/utils/gameInviteParticipant';
import { useParticipantsOnlineCount } from '@/hooks/useParticipantsOnlineCount';

interface ChatParticipantsButtonProps {
  game: Game | null;
  onClick: () => void;
}

const AVATAR_SIZE_DEFAULT = 'w-8 h-8';
const AVATAR_SIZE_COMPACT = 'w-[22px] h-[22px]';
const AVATAR_BORDER_DEFAULT = 'border-2';
const AVATAR_BORDER_COMPACT = 'border';

export const ChatParticipantsButton: React.FC<ChatParticipantsButtonProps> = ({ game, onClick }) => {
  const { t } = useTranslation();
  const participantIds = useMemo(
    () => [...new Set((game?.participants ?? []).map((p) => p.userId).filter((id) => id.length > 0))],
    [game?.participants],
  );
  const onlineCount = useParticipantsOnlineCount(
    participantIds,
    game?.id ? `game-chat-participants:${game.id}` : 'game-chat-participants:none',
    !!game,
  );
  const participants = game?.participants ?? [];
  const showOnline = onlineCount != null && onlineCount > 0;
  const avatarSize = showOnline ? AVATAR_SIZE_COMPACT : AVATAR_SIZE_DEFAULT;
  const avatarBorder = showOnline ? AVATAR_BORDER_COMPACT : AVATAR_BORDER_DEFAULT;
  const avatarStackClass = showOnline ? 'flex items-center -space-x-4' : 'flex items-center -space-x-5';

  const playingParticipants = participants.filter((p) => p.status === 'PLAYING');
  const guestParticipants = participants.filter((p) => p.status === 'GUEST' || p.status === 'IN_QUEUE');
  const invitedParticipants = participants.filter((p) => isPendingGameInvite(p));
  const totalUsers = participants.length;
  const maxVisible = 3;

  const visibleParticipants = playingParticipants.slice(0, maxVisible);
  const remainingSlotsAfterParticipants = maxVisible - playingParticipants.length;
  const visibleGuests =
    remainingSlotsAfterParticipants > 0 ? guestParticipants.slice(0, remainingSlotsAfterParticipants) : [];
  const remainingSlotsAfterGuests = maxVisible - playingParticipants.length - visibleGuests.length;
  const visibleInvites =
    remainingSlotsAfterGuests > 0 ? invitedParticipants.slice(0, remainingSlotsAfterGuests) : [];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 flex-shrink-0 flex-col items-end justify-center hover:opacity-80 transition-opacity ${
        showOnline ? 'gap-0' : ''
      }`}
    >
      <div className={avatarStackClass}>
        {visibleParticipants.map((participant) => (
          <div
            key={participant.userId}
            className={`${avatarSize} flex-shrink-0 rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold ${avatarBorder} border-white dark:border-gray-800`}
            title={`${participant.user.firstName || ''} ${participant.user.lastName || ''}`.trim()}
          >
            {participant.user.avatar ? (
              <img
                src={participant.user.avatar || ''}
                alt=""
                className={`${avatarSize} rounded-full object-cover`}
              />
            ) : (
              (participant.user.firstName || 'U').charAt(0).toUpperCase()
            )}
          </div>
        ))}
        {visibleGuests.map((guest) => (
          <div
            key={`guest-${guest.userId}`}
            className={`${avatarSize} flex-shrink-0 rounded-full overflow-hidden bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white text-xs font-semibold ${avatarBorder} border-white dark:border-gray-800`}
            title={`${guest.user.firstName || ''} ${guest.user.lastName || ''} (guest)`.trim()}
          >
            {guest.user.avatar ? (
              <img
                src={guest.user.avatar || ''}
                alt=""
                className={`${avatarSize} rounded-full object-cover`}
              />
            ) : (
              (guest.user.firstName || 'G').charAt(0).toUpperCase()
            )}
          </div>
        ))}
        {visibleInvites.map((p) => (
          <div
            key={`invite-${p.userId}`}
            className={`${avatarSize} flex-shrink-0 rounded-full overflow-hidden bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-xs font-semibold ${avatarBorder} border-white dark:border-gray-800`}
            title={`${p.user?.firstName || ''} ${p.user?.lastName || ''} (invited)`.trim()}
          >
            {p.user?.firstName ? p.user.firstName.charAt(0).toUpperCase() : 'I'}
          </div>
        ))}
        {totalUsers > maxVisible && (
          <div
            className={`${avatarSize} flex-shrink-0 rounded-full overflow-hidden bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 text-xs font-semibold ${avatarBorder} border-white dark:border-gray-800`}
          >
            +{totalUsers - maxVisible}
          </div>
        )}
      </div>
      {showOnline && (
        <span className="text-[10px] leading-[10px] text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap">
          {t('chat.onlineCount', { count: onlineCount })}
        </span>
      )}
    </button>
  );
};
