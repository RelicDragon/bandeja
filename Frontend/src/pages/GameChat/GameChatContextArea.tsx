import React from 'react';
import { chatApi } from '@/api/chat';
import { ChatContextPanel } from '@/components/chat/contextPanels';
import { GroupChannelSettings } from '@/components/chat/GroupChannelSettings';
import { MarketItemPanel } from '@/components/marketplace';
import { useThreadChrome, useThreadMessageActions } from './useThreadView';

/** Context panel and slide-over overlays — chrome seam (+ loadMessages for refresh). */
export const GameChatContextArea: React.FC = () => {
  const {
    id,
    contextType,
    bug,
    groupChannel,
    setGroupChannel,
    setGroupChannelParticipantsCount,
    loadContext,
    derived,
    panels,
    showLoadingHeader,
    handleJoinChannel,
  } = useThreadChrome();
  const { loadMessages } = useThreadMessageActions();

  const refreshContext = () => id && loadContext({ force: true }).then(() => loadMessages());

  return (
    <>
      {!showLoadingHeader && !panels.showParticipantsPage && !panels.showItemPage && (
        <ChatContextPanel
          contextType={contextType as 'GAME' | 'USER' | 'GROUP'}
          bug={bug}
          marketItem={groupChannel?.marketItem}
          groupChannel={groupChannel}
          canEditBug={derived.canEditBug}
          onUpdate={refreshContext}
          onJoinChannel={handleJoinChannel}
        />
      )}

      {contextType === 'GROUP' && derived.isItemChat && (panels.showItemPage || panels.isItemPageAnimating) && groupChannel?.marketItem && (
        <div
          className={`absolute inset-0 h-full transition-all duration-300 ease-in-out bg-gray-50 dark:bg-gray-900 ${
            panels.showItemPage && !panels.isItemPageAnimating
              ? 'opacity-100 translate-x-0 z-10'
              : 'opacity-0 translate-x-full z-0 pointer-events-none'
          }`}
          onTransitionEnd={() =>
            panels.isItemPageAnimating && !panels.showItemPage && panels.setIsItemPageAnimating(false)
          }
        >
          <MarketItemPanel
            item={groupChannel.marketItem}
            onClose={panels.closeItemPage}
            onItemUpdate={refreshContext}
          />
        </div>
      )}

      {contextType === 'GROUP' && !derived.isItemChat && (panels.showParticipantsPage || panels.isParticipantsPageAnimating) && groupChannel && (
        <div
          className={`absolute inset-0 h-full transition-all duration-300 ease-in-out bg-gray-50 dark:bg-gray-900 ${
            panels.showParticipantsPage && !panels.isParticipantsPageAnimating
              ? 'opacity-100 translate-x-0 z-10'
              : 'opacity-0 translate-x-full z-0 pointer-events-none'
          }`}
          onTransitionEnd={() =>
            panels.isParticipantsPageAnimating && !panels.showParticipantsPage && panels.setIsParticipantsPageAnimating(false)
          }
        >
          <GroupChannelSettings
            groupChannel={groupChannel}
            onParticipantsCountChange={setGroupChannelParticipantsCount}
            onUpdate={async () => {
              if (id) {
                const updated = await chatApi.getGroupChannelById(id);
                setGroupChannel(updated.data);
                setGroupChannelParticipantsCount(updated.data.participantsCount || 0);
              }
            }}
          />
        </div>
      )}
    </>
  );
};
