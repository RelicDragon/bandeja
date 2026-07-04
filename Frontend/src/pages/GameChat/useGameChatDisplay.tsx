import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Bug as BugIcon, Users, Hash, Package } from 'lucide-react';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { formatDate } from '@/utils/dateFormat';
import {
  getGameHeaderTitle,
  getLeagueGameHeaderParts,
  getLeagueGameHeaderTitle,
  getLeagueSeasonHeaderParts,
  getLeagueSeasonHeaderTitle,
} from '@/utils/getGameHeaderTitle';
import { GameChatGameTitleMeta, GameChatGameTitlePrimary } from './GameChatGameTitle';
import { getGameTimeDisplay } from '@/utils/gameTimeDisplay';
import type { ResolvedDisplaySettings } from '@/utils/displayPreferences';
import type { ChatContextType, UserChat, GroupChannel } from '@/api/chat';
import type { Game, Bug } from '@/types';
import type { ArchivedGameChatMeta } from '@/utils/cancelledGameChatStub';
import { useGroupChannelOnlineCount } from './useGroupChannelOnlineCount';

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
  isGameChatArchived?: boolean;
  archivedGameMeta?: ArchivedGameChatMeta | null;
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
  isGameChatArchived = false,
  archivedGameMeta = null,
}: UseGameChatDisplayParams) {
  const { t } = useTranslation();
  const groupOnlineCount = useGroupChannelOnlineCount(
    groupChannel,
    contextType === 'GROUP' && !!groupChannel,
  );

  const structuredHeaderParts = useMemo(() => {
    if (contextType !== 'GAME' || !game) return null;
    return getLeagueGameHeaderParts(game, t) ?? getLeagueSeasonHeaderParts(game);
  }, [contextType, game, t]);

  const titleContent = useMemo(() => {
    if (!structuredHeaderParts) return null;
    return <GameChatGameTitlePrimary parts={structuredHeaderParts} />;
  }, [structuredHeaderParts]);

  const titleMetaRow = useMemo(() => {
    if (structuredHeaderParts?.kind !== 'league') return null;
    return <GameChatGameTitleMeta parts={structuredHeaderParts} />;
  }, [structuredHeaderParts]);

  const title = (() => {
    if (contextType === 'GAME' && game) {
      return getGameHeaderTitle(game, t);
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
    if (contextType === 'GAME' && game && isGameChatArchived) {
      const when = archivedGameMeta?.cancelledAt
        ? formatDate(archivedGameMeta.cancelledAt, 'PPp')
        : null;
      const base = t('chat.archivedGameChatBanner');
      return when ? `${base} · ${when}` : base;
    }
    if (contextType === 'GAME' && game) {
      if (game.timeIsSet === false) return t('gameDetails.datetimeNotSet');
      const longDateD = getGameTimeDisplay({ game, displaySettings, startTime: game.startTime, kind: 'longDate', t });
      const timeRangeD = getGameTimeDisplay({ game, displaySettings, startTime: game.startTime, endTime: game.endTime, kind: 'timeRange', t });
      return `${longDateD.primaryText} • ${timeRangeD.primaryText}`;
    }
    if (isBugChat && bug) return `${formatDate(bug.createdAt, 'PPP')} • ${t(`bug.types.${bug.bugType}`)} • ${t(`bug.statuses.${bug.status}`)}`;
    if (contextType === 'GROUP' && groupChannel) {
      const participantsLabel = t('chat.participants', { count: groupChannelParticipantsCount });
      if (groupOnlineCount == null) return participantsLabel;
      return `${participantsLabel} · ${t('chat.onlineCount', { count: groupOnlineCount })}`;
    }
    return null;
  })();

  const icon = useMemo(() => {
    if (isBugChat) return <BugIcon size={16} className="text-red-500" />;
    if (
      contextType === 'GAME' &&
      game &&
      !game.name &&
      !getLeagueGameHeaderTitle(game, t) &&
      !getLeagueSeasonHeaderTitle(game)
    ) {
      return <MapPin size={16} className="text-gray-500 dark:text-gray-400" />;
    }
    if (contextType === 'USER' && userChat) {
      const otherUser = userChat.user1Id === userId ? userChat.user2 : userChat.user1;
      return <PlayerAvatar player={otherUser} extrasmall fullHideName asDiv />;
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
  }, [
    isBugChat,
    contextType,
    game,
    t,
    userChat,
    userId,
    groupChannel,
    isItemChat,
    onOpenItemPage,
    onOpenParticipantsPage,
  ]);

  return { title, titleContent, titleMetaRow, subtitle, icon };
}
