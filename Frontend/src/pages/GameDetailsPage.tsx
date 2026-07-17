import { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Card } from '@/components';
import { ResizableSplitter } from '@/components/ResizableSplitter';
import { SplitViewLeftPanel, SplitViewRightPanel } from '@/components/SplitViewPanels';
import { useDesktop } from '@/hooks/useDesktop';
import { useIsLandscape } from '@/hooks/useIsLandscape';
import { useGameDetailsChromeStore } from '@/components/GameDetails/gameDetailsChromeStore';
import { gamesApi } from '@/api';
import { canShowTournamentTableView } from '@/utils/gameResults';
import {
  isCancelledGame410Payload,
  layoutInfoFrom410,
  type CancelledGameParticipantSnapshot,
} from '@/utils/cancelledGameChatStub';
import type { Game } from '@/types';
import { GameDetailsContent } from './GameDetails';
import { LeagueDetailsContent } from './LeagueDetails';
import { GameChat } from './GameChat';
import { useTranslation } from 'react-i18next';
import { AnimatedPresencePanel } from '@/components/motion/AnimatedPresencePanel';
import { ScrollEdgeHints } from '@/components/GameDetails/ScrollEdgeHints';

type EntityRouteState =
  | { status: 'loading' }
  | { status: 'ready'; variant: 'league' | 'game'; initialGame: Game }
  | { status: 'error' }
  | { status: 'cancelled' };

export const GameDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { t } = useTranslation();
  const isDesktop = useDesktop();
  const isLandscape = useIsLandscape();
  const gameDetailsTableViewOverride = useGameDetailsChromeStore((s) => s.gameDetailsTableViewOverride);
  const setGameDetailsTableViewOverride = useGameDetailsChromeStore((s) => s.setGameDetailsTableViewOverride);
  const setGameDetailsCanShowTableView = useGameDetailsChromeStore((s) => s.setGameDetailsCanShowTableView);
  const gameDetailsCanShowTableView = useGameDetailsChromeStore((s) => s.gameDetailsCanShowTableView);
  const setGameDetailsOccludesSideChat = useGameDetailsChromeStore((s) => s.setGameDetailsOccludesSideChat);
  const effectiveTableView = gameDetailsTableViewOverride ?? isLandscape;
  const effectiveLeagueFixtureTableView = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    return sp.get('tab') === 'schedule' && sp.get('subtab')?.trim().toLowerCase() === 'table';
  }, [location.search]);
  const [layoutTableAvailable, setLayoutTableAvailable] = useState<boolean | null>(null);
  const [layoutCancelledInfo, setLayoutCancelledInfo] = useState<{
    entityType: string;
    name: string | null;
    sport?: import('@/types').Sport;
    cancelledAt: string;
    cancelledByUser?: import('@/types').BasicUser | null;
    participants?: CancelledGameParticipantSnapshot[];
  } | null>(null);
  const [entityRoute, setEntityRoute] = useState<EntityRouteState>({ status: 'loading' });
  const layoutLeagueFixtureTable =
    entityRoute.status === 'ready' &&
    entityRoute.variant === 'league' &&
    entityRoute.initialGame.entityType === 'LEAGUE_SEASON' &&
    !!entityRoute.initialGame.hasFixedTeams &&
    effectiveLeagueFixtureTableView;
  const useTournamentTableLayout =
    effectiveTableView && (layoutTableAvailable === null || layoutTableAvailable || gameDetailsCanShowTableView);
  const useTableViewLayout = useTournamentTableLayout || layoutLeagueFixtureTable;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const mobileContentRef = useRef<HTMLDivElement>(null);
  const [selectedGameChatId, setSelectedGameChatId] = useState<string | null>(null);
  const showScrollMoreHint =
    entityRoute.status === 'ready' || entityRoute.status === 'cancelled';

  const bootstrapMatchesRoute =
    entityRoute.status !== 'ready' || entityRoute.initialGame.id === id;

  const occludesSideChat =
    (isDesktop || isLandscape) &&
    entityRoute.status !== 'loading' &&
    bootstrapMatchesRoute &&
    useTableViewLayout;

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    scrollContainerRef.current?.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    setGameDetailsTableViewOverride(null);
    setGameDetailsCanShowTableView(false);
    setGameDetailsOccludesSideChat(false);
    setLayoutTableAvailable(null);
    setLayoutCancelledInfo(null);
    setSelectedGameChatId(null);
    setEntityRoute({ status: 'loading' });
  }, [id, setGameDetailsTableViewOverride, setGameDetailsCanShowTableView, setGameDetailsOccludesSideChat]);

  useLayoutEffect(() => {
    if (entityRoute.status !== 'ready' && entityRoute.status !== 'cancelled') return;
    window.scrollTo(0, 0);
    scrollContainerRef.current?.scrollTo(0, 0);
  }, [id, entityRoute.status]);

  useEffect(() => {
    setGameDetailsOccludesSideChat(occludesSideChat);
    return () => setGameDetailsOccludesSideChat(false);
  }, [occludesSideChat, setGameDetailsOccludesSideChat]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setEntityRoute({ status: 'loading' });
    gamesApi
      .getById(id)
      .then((res) => {
        if (cancelled) return;
        const data = res.data;
        setLayoutTableAvailable(canShowTournamentTableView(data));
        const et = data.entityType;
        const variant = et === 'LEAGUE' || et === 'LEAGUE_SEASON' ? 'league' : 'game';
        setEntityRoute({ status: 'ready', variant, initialGame: data });
      })
      .catch((err: { response?: { status?: number; data?: unknown } }) => {
        if (cancelled) return;
        if (err.response?.status === 410 && isCancelledGame410Payload(err.response.data)) {
          setLayoutCancelledInfo(layoutInfoFrom410(err.response.data));
          setLayoutTableAvailable(false);
          setEntityRoute({ status: 'cancelled' });
        } else {
          console.error('GameDetails bootstrap fetch failed:', err);
          setLayoutTableAvailable(false);
          setEntityRoute({ status: 'error' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) return null;

  const effectiveChatId = selectedGameChatId ?? id;
  const canShowSplitLayout = isDesktop || isLandscape;

  const handleChatGameSelect = (gameId: string) => {
    setSelectedGameChatId((prev) => (prev === gameId ? null : gameId));
  };

  const detailsCommon = {
    selectedGameChatId,
    onChatGameSelect: handleChatGameSelect,
    layoutCancelledInfo,
  };

  const renderEntityDetails = () => {
    if (entityRoute.status === 'loading') {
      return (
        <AnimatedPresencePanel panelKey="game-details-page-loading">
          <div className="flex items-center justify-center min-h-[calc(100vh-60px)]">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">{t('app.loading')}</p>
            </div>
          </div>
        </AnimatedPresencePanel>
      );
    }
    if (entityRoute.status === 'error') {
      return (
        <AnimatedPresencePanel panelKey="game-details-page-error">
          <div className="flex items-center justify-center min-h-[calc(100vh-60px)] p-4">
            <Card className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400">{t('errors.notFound')}</p>
            </Card>
          </div>
        </AnimatedPresencePanel>
      );
    }
    if (entityRoute.status === 'cancelled') {
      return <GameDetailsContent {...detailsCommon} />;
    }
    if (entityRoute.variant === 'league') {
      return <LeagueDetailsContent {...detailsCommon} initialGame={entityRoute.initialGame} />;
    }
    return <GameDetailsContent {...detailsCommon} initialGame={entityRoute.initialGame} />;
  };

  if (canShowSplitLayout) {
    const leftPanel = (
      <SplitViewLeftPanel bottomTabsVisible={false}>
        <div className="relative flex h-full min-h-0 flex-col">
          <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-auto p-3">
            {renderEntityDetails()}
          </div>
          <ScrollEdgeHints scrollRef={scrollContainerRef} enabled={showScrollMoreHint} />
        </div>
      </SplitViewLeftPanel>
    );

    if (useTableViewLayout) {
      return (
        <div className="fixed inset-0 top-[calc(4rem+env(safe-area-inset-top))] overflow-hidden">
          <div className="relative flex h-full min-h-0 flex-col">
            <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-auto">
              {renderEntityDetails()}
            </div>
            <ScrollEdgeHints scrollRef={scrollContainerRef} enabled={showScrollMoreHint} />
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
    <div ref={mobileContentRef} className="relative">
      {renderEntityDetails()}
      <ScrollEdgeHints contentRef={mobileContentRef} enabled={showScrollMoreHint} />
    </div>
  );
};
