import { useRef, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ResizableSplitter } from '@/components/ResizableSplitter';
import { SplitViewLeftPanel, SplitViewRightPanel } from '@/components/SplitViewPanels';
import { useDesktop } from '@/hooks/useDesktop';
import { useNavigationStore } from '@/store/navigationStore';
import { GameDetailsContent } from './GameDetails';
import { GameChat } from './GameChat';

export const GameDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const isDesktop = useDesktop();
  const gameDetailsShowTableView = useNavigationStore((s) => s.gameDetailsShowTableView);
  const setGameDetailsShowTableView = useNavigationStore((s) => s.setGameDetailsShowTableView);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [selectedGameChatId, setSelectedGameChatId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedGameChatId(null);
  }, [id]);

  useEffect(() => {
    return () => setGameDetailsShowTableView(false);
  }, [setGameDetailsShowTableView]);

  if (!id) return null;

  const effectiveChatId = selectedGameChatId ?? id;

  const handleChatGameSelect = (gameId: string) => {
    setSelectedGameChatId((prev) => (prev === gameId ? null : gameId));
  };

  if (isDesktop) {
    const leftPanel = (
      <SplitViewLeftPanel bottomTabsVisible={false}>
        <div ref={scrollContainerRef} className="h-full overflow-y-auto overflow-x-hidden p-3">
          <GameDetailsContent
            scrollContainerRef={scrollContainerRef}
            selectedGameChatId={selectedGameChatId}
            onChatGameSelect={handleChatGameSelect}
          />
        </div>
      </SplitViewLeftPanel>
    );

    if (gameDetailsShowTableView) {
      return (
        <div className="fixed inset-0 top-[calc(4rem+env(safe-area-inset-top))] overflow-hidden">
          <div ref={scrollContainerRef} className="h-full overflow-y-auto overflow-x-hidden">
            <GameDetailsContent
              scrollContainerRef={scrollContainerRef}
              selectedGameChatId={selectedGameChatId}
              onChatGameSelect={handleChatGameSelect}
            />
          </div>
        </div>
      );
    }

    const rightPanel = (
      <SplitViewRightPanel
        selectedId={`game-${effectiveChatId}`}
        isTransitioning={false}
        emptyState={null}
      >
        <GameChat key={`game-${effectiveChatId}`} isEmbedded={true} chatId={effectiveChatId} chatType="game" />
      </SplitViewRightPanel>
    );

    return (
      <div className="fixed inset-0 top-[calc(4rem+env(safe-area-inset-top))] overflow-hidden">
        <ResizableSplitter
          defaultLeftWidth={45}
          minLeftWidth={320}
          maxLeftWidth={700}
          leftPanel={leftPanel}
          rightPanel={rightPanel}
        />
      </div>
    );
  }

  return (
    <GameDetailsContent
      selectedGameChatId={selectedGameChatId}
      onChatGameSelect={handleChatGameSelect}
    />
  );
};
