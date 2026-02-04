import { useRef } from 'react';
import { useParams } from 'react-router-dom';
import { ResizableSplitter } from '@/components/ResizableSplitter';
import { SplitViewLeftPanel, SplitViewRightPanel } from '@/components/SplitViewPanels';
import { useDesktop } from '@/hooks/useDesktop';
import { GameDetailsContent } from './GameDetails';
import { GameChat } from './GameChat';

export const GameDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const isDesktop = useDesktop();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  if (!id) return null;

  if (isDesktop) {
    const leftPanel = (
      <SplitViewLeftPanel bottomTabsVisible={false}>
        <div ref={scrollContainerRef} className="h-full overflow-y-auto overflow-x-hidden p-3">
          <GameDetailsContent scrollContainerRef={scrollContainerRef} />
        </div>
      </SplitViewLeftPanel>
    );

    const rightPanel = (
      <SplitViewRightPanel
        selectedId={`game-${id}`}
        isTransitioning={false}
        emptyState={null}
      >
        <GameChat key={`game-${id}`} isEmbedded={true} chatId={id} chatType="game" />
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

  return <GameDetailsContent />;
};
