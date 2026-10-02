import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ChatType } from '@/types';
import { GameChatTabs } from './GameChatTabs';
import { useThreadChrome } from './useThreadView';
import { useLeagueSeasonGroupChats } from './useLeagueSeasonGroupChats';

const SEASON_CHAT_TYPES: ChatType[] = ['PUBLIC'];

/** Game chat type tabs — chrome seam only. League seasons add the viewer's group chats as tabs. */
export const GameChatTabsSection: React.FC = () => {
  const navigate = useNavigate();
  const {
    contextType,
    game,
    groupChannel,
    derived,
    showLoadingHeader,
    currentChatType,
    isSwitchingChatType,
    isThreadOpenSettling,
    isInitialLoad,
    handleChatTypeChange,
  } = useThreadChrome();

  const leagueGroupSeasonId = contextType === 'GROUP' ? groupChannel?.leagueGroup?.leagueSeasonId ?? null : null;
  const leagueSeasonId =
    contextType === 'GAME' && game?.entityType === 'LEAGUE_SEASON' ? game.id : leagueGroupSeasonId;
  const groupChats = useLeagueSeasonGroupChats(leagueSeasonId);

  const openGroupChat = useCallback(
    (groupChannelId: string) => {
      navigate(`/group-chat/${groupChannelId}`, { replace: true, state: { contextType: 'GROUP' } });
    },
    [navigate]
  );

  const openSeasonChat = useCallback(
    (chatType: ChatType) => {
      if (!leagueGroupSeasonId) return;
      navigate(`/games/${leagueGroupSeasonId}/chat`, {
        replace: true,
        state: { contextType: 'GAME', initialChatType: chatType },
      });
    },
    [navigate, leagueGroupSeasonId]
  );

  const chromeSettling = isThreadOpenSettling || isInitialLoad;
  const showGameChatTabs =
    !showLoadingHeader &&
    contextType === 'GAME' &&
    ((derived.isParticipant && derived.isPlayingParticipant) ||
      derived.isAdminOrOwner ||
      (game?.status && game.status !== 'ANNOUNCED'));
  const showLeagueGroupTabs = !showLoadingHeader && leagueGroupSeasonId != null && groupChats.length > 0;

  if (!showGameChatTabs && !showLeagueGroupTabs) return null;

  return (
    <div
      className={
        chromeSettling
          ? 'absolute top-0 left-0 right-0 z-[3]'
          : 'relative flex-shrink-0 z-[2]'
      }
    >
      {showLeagueGroupTabs ? (
        <GameChatTabs
          availableChatTypes={SEASON_CHAT_TYPES}
          currentChatType="PUBLIC"
          isSwitchingChatType={false}
          onChatTypeChange={openSeasonChat}
          groupChats={groupChats}
          activeGroupChatId={groupChannel?.id ?? null}
          onOpenGroupChat={openGroupChat}
        />
      ) : (
        <GameChatTabs
          availableChatTypes={derived.availableChatTypes}
          currentChatType={currentChatType}
          isSwitchingChatType={isSwitchingChatType}
          onChatTypeChange={handleChatTypeChange}
          groupChats={groupChats}
          onOpenGroupChat={openGroupChat}
        />
      )}
    </div>
  );
};
