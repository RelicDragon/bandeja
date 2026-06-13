import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { MainLayout } from '@/layouts/MainLayout';
import { useShellNavStore } from '@/store/shellNavStore';
import { BottomTabBar } from '@/components/navigation/BottomTabBar';
import { useDesktop } from '@/hooks/useDesktop';
import { useIsLandscape } from '@/hooks/useIsLandscape';
import { isChatShellPlace, isMarketplaceShellPlace, parseLocation } from '@/utils/urlSchema';
import { MyTab } from './MyTab';
import { FindTab } from './FindTab';
import { ChatsTab } from './ChatsTab';
import { LeaderboardTab } from './LeaderboardTab';
import { ProfileTab } from './ProfileTab';
import { GameDetailsPage } from './GameDetailsPage';
import { GameSubscriptionsContent } from './GameSubscriptions';
import { MarketplaceList } from './MarketplaceList';
import { MarketplaceItemRedirect } from './MarketplaceItemRedirect';
import { CreateMarketItem } from './CreateMarketItem';
import { UserTeamPage } from './UserTeamPage';
import { UserProfilePage } from './UserProfilePage';
import { useAuthStore } from '@/store/authStore';
import { hasEnabledSports } from '@/utils/profileSports';

function MarketplaceContent() {
  const location = useLocation();
  const path = location.pathname;
  if (path === '/marketplace/create') return <CreateMarketItem />;
  if (path.match(/^\/marketplace\/[^/]+\/edit$/)) return <CreateMarketItem />;
  if (path === '/marketplace/my') return <MarketplaceList />;
  if (path.match(/^\/marketplace\/[^/]+$/)) return <MarketplaceItemRedirect />;
  return <MarketplaceList />;
}

export const MainPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { bottomTabsVisible, initShellAnimationPlayed, activeTab, findViewMode } = useShellNavStore(
    useShallow((s) => ({
      bottomTabsVisible: s.bottomTabsVisible,
      initShellAnimationPlayed: s.initShellAnimationPlayed,
      activeTab: s.activeTab,
      findViewMode: s.findViewMode,
    }))
  );
  const isDesktop = useDesktop();
  const isLandscape = useIsLandscape();
  const animateShellEntry = location.pathname === '/' && !initShellAnimationPlayed;

  const parsed = useMemo(
    () => parseLocation(location.pathname, location.search),
    [location.pathname, location.search]
  );

  const showGameTabs = hasEnabledSports(user);

  useEffect(() => {
    if (parsed.place !== 'home') return;
    const tab = new URLSearchParams(location.search).get('tab');
    if (tab === 'list' || tab === 'past-games') {
      navigate('/', { replace: true });
    }
  }, [parsed.place, location.search, navigate]);

  useEffect(() => {
    if (showGameTabs) return;
    if (parsed.place === 'home' || parsed.place === 'find') {
      navigate('/profile', { replace: true });
    }
  }, [showGameTabs, parsed.place, navigate]);

  const isCalendarSplitView = isDesktop && (
    (parsed.place === 'home' && activeTab === 'calendar') ||
    (parsed.place === 'find' && findViewMode === 'calendar')
  );

  const scrollablePage =
    parsed.place === 'home' ||
    parsed.place === 'find' ||
    parsed.place === 'userProfile' ||
    parsed.place === 'leaderboard';
  const isTeamsPage = parsed.place === 'userTeam';

  const renderContent = useMemo(() => {
    switch (parsed.place) {
      case 'home':
        return <MyTab />;
      case 'find':
        return <FindTab />;
      case 'leaderboard':
        return <LeaderboardTab />;
      case 'profile':
        return <ProfileTab />;
      case 'game':
        return <GameDetailsPage />;
      case 'gameSubscriptions':
        return <GameSubscriptionsContent />;
      case 'userTeam':
        return <UserTeamPage />;
      case 'userProfile':
        return <UserProfilePage />;
      default:
        if (isChatShellPlace(parsed.place)) {
          return <ChatsTab />;
        }
        if (isMarketplaceShellPlace(parsed.place)) {
          return <MarketplaceContent />;
        }
        return <MyTab />;
    }
  }, [parsed.place]);

  const isChatPage = isChatShellPlace(parsed.place);
  const isOnSpecificChatRoute = location.pathname.includes('/user-chat/') ||
                                 location.pathname.includes('/group-chat/') ||
                                 location.pathname.includes('/channel-chat/') ||
                                 location.pathname.match(/^\/games\/[^/]+\/chat$/) ||
                                 location.pathname.match(/^\/bugs\/[^/]+$/);
  const shouldShowChatsSplitView = isChatPage && (isDesktop || !isOnSpecificChatRoute);
  const showBottomTabBar = bottomTabsVisible && (!isDesktop || isChatPage);

  if (isChatPage && shouldShowChatsSplitView) {
    return (
      <MainLayout>
        <ChatsTab />
        {!isDesktop && (
          <div
            className={showBottomTabBar ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
            aria-hidden={!showBottomTabBar}
          >
            <BottomTabBar animateEntry={animateShellEntry} />
          </div>
        )}
      </MainLayout>
    );
  }

  const isGameDetailsPage = location.pathname.match(/^\/games\/[^/]+$/) && !location.pathname.includes('/chat');
  const isGameDetailsSplitView = parsed.place === 'game' && isGameDetailsPage && (isDesktop || isLandscape);
  const isGameDetailsMobileScroll =
    parsed.place === 'game' && isGameDetailsPage && !isGameDetailsSplitView;
  if (isGameDetailsSplitView) {
    return (
      <MainLayout>
        <GameDetailsPage />
        {bottomTabsVisible && <BottomTabBar animateEntry={animateShellEntry} />}
      </MainLayout>
    );
  }

  if (isChatPage && !isDesktop && isOnSpecificChatRoute) {
    return <ChatsTab />;
  }

  if (isCalendarSplitView) {
    return (
      <MainLayout>
        {renderContent}
        {bottomTabsVisible && <BottomTabBar animateEntry={animateShellEntry} />}
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div
        className={`relative px-2 ${
          !scrollablePage && !isTeamsPage && !isGameDetailsMobileScroll ? 'min-h-0 overflow-hidden' : ''
        } ${isTeamsPage ? 'flex min-h-0 min-w-0 flex-1 flex-col' : ''}`}
        style={{ paddingBottom: bottomTabsVisible && !isTeamsPage ? '5rem' : '0' }}
      >
        <div
          className={`transition-all duration-300 ease-in-out transform translate-x-0 opacity-100 ${
            isTeamsPage ? 'flex min-h-0 min-w-0 flex-1 flex-col' : ''
          }`}
        >
          {renderContent}
        </div>
      </div>
      {bottomTabsVisible && <BottomTabBar animateEntry={animateShellEntry} />}
    </MainLayout>
  );
};
