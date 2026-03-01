import { useTranslation } from 'react-i18next';
import { MapPin, Bug as BugIcon, Users, Hash, Package } from 'lucide-react';
import { formatDate } from '@/utils/dateFormat';
import { getGameTimeDisplay } from '@/utils/gameTimeDisplay';
import type { ResolvedDisplaySettings } from '@/utils/displayPreferences';
import type { ChatContextType, UserChat, GroupChannel } from '@/api/chat';
import type { Game, Bug } from '@/types';

export interface UseGameChatDisplayParams {
  contextType: ChatContextType;
  game: Game | null;
  bug: Bug | null;
  userChat: UserChat | null;
  groupChannel: GroupChannel | null;
  groupChannelParticipantsCount: number;
  isBugChat: boolean;
  isItemChat: boolean;
  userId: string | undefined;
  displaySettings: ResolvedDisplaySettings;
  onOpenItemPage: () => void;
  onOpenParticipantsPage: () => void;
}

export function useGameChatDisplay({
  contextType,
  game,
  bug,
  userChat,
  groupChannel,
  groupChannelParticipantsCount,
  isBugChat,
  isItemChat,
  userId,
  displaySettings,
  onOpenItemPage,
  onOpenParticipantsPage,
}: UseGameChatDisplayParams) {
  const { t } = useTranslation();

  const title = (() => {
    if (contextType === 'GAME' && game) {
      if (game.name) return game.name;
      if (game.club) return `${game.club.name}`;
      return `${game.gameType} Game`;
    }
    if (isBugChat && bug) return bug.text.length > 25 ? `${bug.text.substring(0, 23)}...` : bug.text;
    if (contextType === 'USER' && userChat) {
      const otherUser = userChat.user1Id === userId ? userChat.user2 : userChat.user1;
      return `${otherUser.firstName || ''} ${otherUser.lastName || ''}`.trim() || 'Unknown';
    }
    if (contextType === 'GROUP' && groupChannel) return groupChannel.name;
    return 'Chat';
  })();

  const subtitle = (() => {
    if (contextType === 'GAME' && game) {
      if (game.timeIsSet === false) return t('gameDetails.datetimeNotSet');
      const longDateD = getGameTimeDisplay({ game, displaySettings, startTime: game.startTime, kind: 'longDate', t });
      const timeRangeD = getGameTimeDisplay({ game, displaySettings, startTime: game.startTime, endTime: game.endTime, kind: 'timeRange', t });
      return `${longDateD.primaryText} • ${timeRangeD.primaryText}`;
    }
    if (isBugChat && bug) return `${formatDate(bug.createdAt, 'PPP')} • ${t(`bug.types.${bug.bugType}`)} • ${t(`bug.statuses.${bug.status}`)}`;
    if (contextType === 'GROUP' && groupChannel) return t('chat.participants', { count: groupChannelParticipantsCount });
    return null;
  })();

  const icon = (() => {
    if (isBugChat) return <BugIcon size={16} className="text-red-500" />;
    if (contextType === 'GAME' && !game?.name) return <MapPin size={16} className="text-gray-500 dark:text-gray-400" />;
    if (contextType === 'USER' && userChat) {
      const otherUser = userChat.user1Id === userId ? userChat.user2 : userChat.user1;
      return (
        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
          {otherUser.avatar ? (
            <img src={otherUser.avatar || ''} alt={otherUser.firstName || ''} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-600 dark:text-gray-300 font-semibold">
              {otherUser.firstName?.[0]}
              {otherUser.lastName?.[0]}
            </div>
          )}
        </div>
      );
    }
    if (contextType === 'GROUP' && groupChannel) {
      const handleClick = () => {
        if (isItemChat) onOpenItemPage();
        else onOpenParticipantsPage();
      };
      return (
        <button onClick={handleClick} className="flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity">
          {groupChannel.marketItem ? (
            groupChannel.marketItem.mediaUrls?.length ? (
              <img
                src={groupChannel.marketItem.mediaUrls[0]}
                alt={groupChannel.name}
                className="w-10 h-10 rounded-full object-cover shadow-lg dark:shadow-[0_0_8px_rgba(251,191,36,0.5),0_0_16px_rgba(251,191,36,0.3)]"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shadow-lg dark:shadow-[0_0_8px_rgba(251,191,36,0.5),0_0_16px_rgba(251,191,36,0.3)]">
                <Package className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              </div>
            )
          ) : groupChannel.avatar ? (
            <img
              src={groupChannel.avatar}
              alt={groupChannel.name}
              className="w-10 h-10 rounded-full object-cover shadow-lg dark:shadow-[0_0_8px_rgba(251,191,36,0.5),0_0_16px_rgba(251,191,36,0.3)]"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shadow-lg dark:shadow-[0_0_8px_rgba(251,191,36,0.5),0_0_16px_rgba(251,191,36,0.3)]">
              {groupChannel.isChannel ? (
                <Hash className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              ) : (
                <Users className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              )}
            </div>
          )}
        </button>
      );
    }
    return null;
  })();

  return { title, subtitle, icon };
}
