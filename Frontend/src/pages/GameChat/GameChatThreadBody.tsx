import React from 'react';
import { GameChatContextArea } from './GameChatContextArea';
import { GameChatMessagesPane } from './GameChatMessagesPane';
import { GameChatPinnedBar } from './GameChatPinnedBar';
import { GameChatTabsSection } from './GameChatTabsSection';
import { ThreadSearchResultsPanel } from './ThreadSearchResultsPanel';
import { useThreadChrome, useThreadSearch } from './useThreadView';

/** Main thread column — chrome orchestration; message list in isolated pane. */
export const GameChatThreadBody: React.FC = () => {
  const { contextType, game, derived, showLoadingHeader } = useThreadChrome();
  const { showResultsPanel, results, isSearching } = useThreadSearch();

  const showGameChatTabs =
    !showLoadingHeader &&
    contextType === 'GAME' &&
    ((derived.isParticipant && derived.isPlayingParticipant) ||
      derived.isAdminOrOwner ||
      (game?.status && game.status !== 'ANNOUNCED'));
  const gameChatTabsVisible = !!(showGameChatTabs && derived.availableChatTypes.length > 1);

  return (
    <main className="flex-1 flex flex-col min-h-0 overflow-hidden overflow-x-hidden relative">
      <div className="relative flex-1 flex flex-col min-h-0">
        <GameChatTabsSection />
        <GameChatPinnedBar gameChatTabsVisible={gameChatTabsVisible} />
        <GameChatContextArea />
        <ThreadSearchResultsPanel visible={showResultsPanel} results={results} isSearching={isSearching} />
        <GameChatMessagesPane />
      </div>
    </main>
  );
};
