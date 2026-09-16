import { usesPremiumTheme } from '@/utils/mainTheme';
import React, { useEffect } from 'react';
import { useShellNavStore } from '@/store/shellNavStore';
import { useAuthStore } from '@/store/authStore';
import { usePremiumNavigationAppearance } from '@/hooks/usePremiumNavigationAppearance';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';
import type { GameChatProps } from './GameChat/types';
import { GameChatHeaderSection } from './GameChat/GameChatHeaderSection';
import { GameChatAccessDenied } from './GameChat/GameChatAccessDenied';
import { GameChatFooterGate } from './GameChat/GameChatFooterGate';
import { GameChatModals } from './GameChat/GameChatModals';
import { GameChatThreadBody } from './GameChat/GameChatThreadBody';
import { ThreadViewProvider } from './GameChat/ThreadViewProvider';
import { useThreadChrome } from './GameChat/useThreadView';
import { parseGameSport } from '@/utils/gameSport';
import { SportLevelProvider } from '@/contexts/SportLevelContext';
import { resolveGameChatViewState } from './GameChat/gameChatRouteState';

export const GameChat: React.FC<GameChatProps> = (props) => (
  <ThreadViewProvider {...props}>
    <GameChatLayout />
  </ThreadViewProvider>
);

const GameChatLayout: React.FC = () => {
  const isPremium = useAuthStore((s) => usesPremiumTheme(s.user));
  const setBottomTabsVisible = useShellNavStore((s) => s.setBottomTabsVisible);
  const {
    id,
    contextType,
    isEmbedded,
    game,
    derived,
    panels,
    chatContainerRef,
    navigate,
    isGameChatAccessDenied,
  } =
    useThreadChrome();

  useEffect(() => {
    if (!isEmbedded) {
      setBottomTabsVisible(false);
      return () => setBottomTabsVisible(true);
    }
  }, [setBottomTabsVisible, isEmbedded]);

  useBackButtonHandler(panels.handleBackButton);

  const containerHidden = panels.showParticipantsPage || panels.showItemPage;
  const viewState = resolveGameChatViewState({
    isGameChatAccessDenied,
    canViewPublicChat: derived.canViewPublicChat,
  });
  usePremiumNavigationAppearance(isPremium && !isEmbedded && !containerHidden && viewState === 'thread');

  if (viewState === 'denied') {
    return <GameChatAccessDenied id={id} navigate={navigate} />;
  }

  const chatLevelSport = contextType === 'GAME' && game ? parseGameSport(game.sport) : undefined;

  return (
    <SportLevelProvider sport={chatLevelSport}>
      <div
        ref={chatContainerRef}
        className={`chat-container ${isPremium ? 'premium-chat premium-chat-thread' : ''} relative bg-gray-50 dark:bg-gray-900 flex flex-col ${isEmbedded ? 'chat-embedded h-full' : 'h-screen'} ${containerHidden ? 'hidden' : ''}`}
      >
        <GameChatHeaderSection />
        <GameChatThreadBody />
        <GameChatFooterGate />
        <GameChatModals />
      </div>
    </SportLevelProvider>
  );
};
