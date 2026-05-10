import { useRef, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card } from '@/components';
import { ResizableSplitter } from '@/components/ResizableSplitter';
import { SplitViewLeftPanel, SplitViewRightPanel } from '@/components/SplitViewPanels';
import { useDesktop } from '@/hooks/useDesktop';
import { useIsLandscape } from '@/hooks/useIsLandscape';
import { useNavigationStore } from '@/store/navigationStore';
import { gamesApi } from '@/api';
import { canShowTournamentTableView } from '@/utils/gameResults';
import type { Game } from '@/types';
import { GameDetailsContent } from './GameDetails';
import { LeagueDetailsContent } from './LeagueDetails';
import { GameChat } from './GameChat';
import { useTranslation } from 'react-i18next';

type EntityRouteState =
  | { status: 'loading' }
  | { status: 'ready'; variant: 'league' | 'game'; initialGame: Game }
  | { status: 'error' }
  | { status: 'cancelled' };

export const GameDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const isDesktop = useDesktop();
  const isLandscape = useIsLandscape();
  const gameDetailsTableViewOverride = useNavigationStore((s) => s.gameDetailsTableViewOverride);
  const setGameDetailsTableViewOverride = useNavigationStore((s) => s.setGameDetailsTableViewOverride);
  const setGameDetailsCanShowTableView = useNavigationStore((s) => s.setGameDetailsCanShowTableView);
  const gameDetailsCanShowTableView = useNavigationStore((s) => s.gameDetailsCanShowTableView);
  const leagueSeasonFixtureTableEligible = useNavigationStore((s) => s.leagueSeasonFixtureTableEligible);
  const leagueSeasonTableViewOverride = useNavigationStore((s) => s.leagueSeasonTableViewOverride);
  const setLeagueSeasonTableViewOverride = useNavigationStore((s) => s.setLeagueSeasonTableViewOverride);
  const setLeagueSeasonFixtureTableEligible = useNavigationStore((s) => s.setLeagueSeasonFixtureTableEligible);
  const effectiveTableView = gameDetailsTableViewOverride ?? isLandscape;
  const effectiveLeagueFixtureTableView = leagueSeasonTableViewOverride ?? isLandscape;
  const [layoutTableAvailable, setLayoutTableAvailable] = useState<boolean | null>(null);
  const [layoutCancelledInfo, setLayoutCancelledInfo] = useState<{
    entityType: string;
    name: string | null;
    cancelledAt: string;
    cancelledByUser?: import('@/types').BasicUser | null;
  } | null>(null);
  const [entityRoute, setEntityRoute] = useState<EntityRouteState>({ status: 'loading' });
  const layoutLeagueFixtureTable =
    entityRoute.status === 'ready' &&
    entityRoute.variant === 'league' &&
    entityRoute.initialGame.entityType === 'LEAGUE_SEASON' &&
    !!entityRoute.initialGame.hasFixedTeams &&
    leagueSeasonFixtureTableEligible &&
    effectiveLeagueFixtureTableView;
  const useTournamentTableLayout =
    effectiveTableView && (layoutTableAvailable === null || layoutTableAvailable || gameDetailsCanShowTableView);
  const useTableViewLayout = useTournamentTableLayout || layoutLeagueFixtureTable;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [selectedGameChatId, setSelectedGameChatId] = useState<string | null>(null);

  useEffect(() => {
    setGameDetailsTableViewOverride(null);
    setLeagueSeasonTableViewOverride(null);
    setLeagueSeasonFixtureTableEligible(false);
    setGameDetailsCanShowTableView(false);
    setLayoutTableAvailable(null);
    setLayoutCancelledInfo(null);
    setSelectedGameChatId(null);
    setEntityRoute({ status: 'loading' });
  }, [
    id,
    setGameDetailsTableViewOverride,
    setLeagueSeasonTableViewOverride,
    setLeagueSeasonFixtureTableEligible,
    setGameDetailsCanShowTableView,
  ]);

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
      .catch((err: { response?: { status?: number; data?: { cancelled?: boolean; entityType?: string; name?: string | null; cancelledAt?: string; cancelledByUser?: import('@/types').BasicUser } } }) => {
        if (cancelled) return;
        if (err.response?.status === 410 && err.response?.data?.cancelled) {
          const d = err.response.data;
          setLayoutCancelledInfo({
            entityType: d?.entityType ?? 'GAME',
            name: d?.name ?? null,
            cancelledAt: d?.cancelledAt ?? new Date().toISOString(),
            cancelledByUser: d?.cancelledByUser ?? null,
          });
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
    scrollContainerRef,
    selectedGameChatId,
    onChatGameSelect: handleChatGameSelect,
    layoutCancelledInfo,
  };

  const renderEntityDetails = () => {
    if (entityRoute.status === 'loading') {
      return (
        <div className="flex items-center justify-center min-h-[calc(100vh-60px)]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">{t('app.loading')}</p>
          </div>
        </div>
      );
    }
    if (entityRoute.status === 'error') {
      return (
        <div className="flex items-center justify-center min-h-[calc(100vh-60px)] p-4">
          <Card className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400">{t('errors.notFound')}</p>
          </Card>
        </div>
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
        <div ref={scrollContainerRef} className="h-full overflow-y-auto overflow-x-hidden p-3">
          {renderEntityDetails()}
        </div>
      </SplitViewLeftPanel>
    );

    if (useTableViewLayout || layoutCancelledInfo) {
      return (
        <div className="fixed inset-0 top-[calc(4rem+env(safe-area-inset-top))] overflow-hidden">
          <div
            ref={scrollContainerRef}
            className={`h-full overflow-x-hidden ${layoutCancelledInfo ? 'overflow-hidden' : 'overflow-y-auto'}`}
          >
            {renderEntityDetails()}
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

  return renderEntityDetails();
};
