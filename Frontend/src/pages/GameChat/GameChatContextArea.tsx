import React from 'react';
import { chatApi } from '@/api/chat';
import { ChatContextPanel } from '@/components/chat/contextPanels';
import { ChatPaneSlideOverlay } from '@/components/chat/ChatPaneSlideOverlay';
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
        <ChatPaneSlideOverlay
          visible={panels.showItemPage}
          animating={panels.isItemPageAnimating}
          onExitComplete={() => panels.setIsItemPageAnimating(false)}
        >
          <MarketItemPanel
            item={groupChannel.marketItem}
            onClose={panels.closeItemPage}
            onItemUpdate={refreshContext}
          />
        </ChatPaneSlideOverlay>
      )}

      {contextType === 'GROUP' && !derived.isItemChat && (panels.showParticipantsPage || panels.isParticipantsPageAnimating) && groupChannel && (
        <ChatPaneSlideOverlay
          visible={panels.showParticipantsPage}
          animating={panels.isParticipantsPageAnimating}
          onExitComplete={() => panels.setIsParticipantsPageAnimating(false)}
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
        </ChatPaneSlideOverlay>
      )}
    </>
  );
};
