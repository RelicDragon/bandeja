import { useRef, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ResizableSplitter } from '@/components/ResizableSplitter';
import { SplitViewLeftPanel, SplitViewRightPanel } from '@/components/SplitViewPanels';
import { useDesktop } from '@/hooks/useDesktop';
import { useIsLandscape } from '@/hooks/useIsLandscape';
import { useNavigationStore } from '@/store/navigationStore';
import { gamesApi } from '@/api';
import { GameDetailsContent } from './GameDetails';
import { GameChat } from './GameChat';

const canShowTableViewFromGame = (g: { entityType?: string; fixedNumberOfSets?: number; resultsStatus?: string }) =>
  g?.entityType === 'TOURNAMENT' &&
  g?.fixedNumberOfSets === 1 &&
  (g?.resultsStatus === 'FINAL' || g?.resultsStatus === 'IN_PROGRESS');

export const GameDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const isDesktop = useDesktop();
  const isLandscape = useIsLandscape();
  const gameDetailsTableViewOverride = useNavigationStore((s) => s.gameDetailsTableViewOverride);
  const setGameDetailsTableViewOverride = useNavigationStore((s) => s.setGameDetailsTableViewOverride);
  const setGameDetailsCanShowTableView = useNavigationStore((s) => s.setGameDetailsCanShowTableView);
  const gameDetailsCanShowTableView = useNavigationStore((s) => s.gameDetailsCanShowTableView);
  const effectiveTableView = gameDetailsTableViewOverride ?? isLandscape;
  const [layoutTableAvailable, setLayoutTableAvailable] = useState<boolean | null>(null);
  const [layoutGame, setLayoutGame] = useState<Awaited<ReturnType<typeof gamesApi.getById>>['data'] | null>(null);
  const useTableViewLayout = effectiveTableView && (layoutTableAvailable === null || layoutTableAvailable || gameDetailsCanShowTableView);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [selectedGameChatId, setSelectedGameChatId] = useState<string | null>(null);
  const prevIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    setGameDetailsTableViewOverride(null);
    setGameDetailsCanShowTableView(false);
    setLayoutTableAvailable(null);
    setLayoutGame(null);
    prevIdRef.current = id ?? undefined;
    setSelectedGameChatId(null);
  }, [id, setGameDetailsTableViewOverride, setGameDetailsCanShowTableView]);

  useEffect(() => {
    if (!id || !effectiveTableView || layoutTableAvailable !== null) return;
    let cancelled = false;
    gamesApi.getById(id).then((res) => {
      if (!cancelled) {
        setLayoutTableAvailable(canShowTableViewFromGame(res.data));
        setLayoutGame(res.data);
      }
    }).catch((err) => {
      if (!cancelled) {
        console.error('GameDetails layout fetch failed:', err);
        setLayoutTableAvailable(false);
      }
    });
    return () => { cancelled = true; };
  }, [id, effectiveTableView, layoutTableAvailable]);

  if (!id) return null;

  const effectiveChatId = selectedGameChatId ?? id;
  const canShowSplitLayout = isDesktop || isLandscape;

  const handleChatGameSelect = (gameId: string) => {
    setSelectedGameChatId((prev) => (prev === gameId ? null : gameId));
  };

  if (canShowSplitLayout) {
    const initialGame = layoutGame?.id === id ? layoutGame : undefined;
    const leftPanel = (
      <SplitViewLeftPanel bottomTabsVisible={false}>
        <div ref={scrollContainerRef} className="h-full overflow-y-auto overflow-x-hidden p-3">
          <GameDetailsContent
            scrollContainerRef={scrollContainerRef}
            selectedGameChatId={selectedGameChatId}
            onChatGameSelect={handleChatGameSelect}
            initialGame={initialGame}
          />
        </div>
      </SplitViewLeftPanel>
    );

    if (useTableViewLayout) {
      return (
        <div className="fixed inset-0 top-[calc(4rem+env(safe-area-inset-top))] overflow-hidden">
          <div ref={scrollContainerRef} className="h-full overflow-y-auto overflow-x-hidden">
            <GameDetailsContent
              scrollContainerRef={scrollContainerRef}
              selectedGameChatId={selectedGameChatId}
              onChatGameSelect={handleChatGameSelect}
              initialGame={initialGame}
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
