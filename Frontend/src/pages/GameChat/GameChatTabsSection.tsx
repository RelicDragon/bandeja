import React from 'react';
import { GameChatTabs } from './GameChatTabs';
import { useThreadChrome } from './useThreadView';

/** Game chat type tabs — chrome seam only. */
export const GameChatTabsSection: React.FC = () => {
  const {
    contextType,
    game,
    derived,
    showLoadingHeader,
    currentChatType,
    isSwitchingChatType,
    isThreadOpenSettling,
    isInitialLoad,
    handleChatTypeChange,
  } = useThreadChrome();

  const chromeSettling = isThreadOpenSettling || isInitialLoad;
  const showGameChatTabs =
    !showLoadingHeader &&
    contextType === 'GAME' &&
    ((derived.isParticipant && derived.isPlayingParticipant) ||
      derived.isAdminOrOwner ||
      (game?.status && game.status !== 'ANNOUNCED'));

  if (!showGameChatTabs) return null;

  return (
    <div
      className={
        chromeSettling
          ? 'absolute top-0 left-0 right-0 z-[3]'
          : 'relative flex-shrink-0 z-[2]'
      }
    >
      <GameChatTabs
        availableChatTypes={derived.availableChatTypes}
        currentChatType={currentChatType}
        isSwitchingChatType={isSwitchingChatType}
        onChatTypeChange={handleChatTypeChange}
      />
    </div>
  );
};
