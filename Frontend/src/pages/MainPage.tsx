import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { MainLayout } from '@/layouts/MainLayout';
import { useNavigationStore } from '@/store/navigationStore';
import { BottomTabBar } from '@/components/navigation/BottomTabBar';
import { useDesktop } from '@/hooks/useDesktop';
import { useIsLandscape } from '@/hooks/useIsLandscape';
import { parseLocation, placeToPageType } from '@/utils/urlSchema';
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
  const { bottomTabsVisible, initShellAnimationPlayed, activeTab, findViewMode } = useNavigationStore();
  const isDesktop = useDesktop();
  const isLandscape = useIsLandscape();
  const animateShellEntry = location.pathname === '/' && !initShellAnimationPlayed;

  const parsed = useMemo(
    () => parseLocation(location.pathname, location.search),
    [location.pathname, location.search]
  );

  const currentPage = placeToPageType(parsed.place);
  const isCalendarSplitView = isDesktop && (
    (currentPage === 'my' && activeTab === 'calendar') ||
    (currentPage === 'find' && findViewMode === 'calendar')
  );

  const scrollablePage = currentPage === 'my' || currentPage === 'find';
  const isTeamsPage = currentPage === 'teams';
  const teamsShellHeightClass = bottomTabsVisible
    ? 'h-[calc(100dvh-12.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] max-h-[calc(100dvh-12.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))]'
    : 'h-[calc(100dvh-7.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] max-h-[calc(100dvh-7.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))]';

  const renderContent = useMemo(() => {
    switch (currentPage) {
      case 'my':
        return <MyTab />;
      case 'find':
        return <FindTab />;
      case 'chats':
        return <ChatsTab />;
      case 'leaderboard':
        return <LeaderboardTab />;
      case 'profile':
        return <ProfileTab />;
      case 'gameDetails':
        return <GameDetailsPage />;
      case 'gameSubscriptions':
        return <GameSubscriptionsContent />;
      case 'marketplace':
        return <MarketplaceContent />;
      case 'teams':
        return <UserTeamPage />;
      default:
        return <MyTab />;
    }
  }, [currentPage]);

  const isChatPage = currentPage === 'chats';
  const isOnSpecificChatRoute = location.pathname.includes('/user-chat/') ||
                                 location.pathname.includes('/group-chat/') ||
                                 location.pathname.includes('/channel-chat/') ||
                                 location.pathname.match(/^\/bugs\/[^/]+$/);
  const shouldShowChatsSplitView = isChatPage && (isDesktop || !isOnSpecificChatRoute);
  const showBottomTabBar = bottomTabsVisible && (!isDesktop || isChatPage);

  if (isChatPage && shouldShowChatsSplitView) {
    return (
      <MainLayout>
        <ChatsTab />
        {showBottomTabBar && !isDesktop && <BottomTabBar animateEntry={animateShellEntry} />}
      </MainLayout>
    );
  }

  const isGameDetailsPage = location.pathname.match(/^\/games\/[^/]+$/) && !location.pathname.includes('/chat');
  const isGameDetailsSplitView = currentPage === 'gameDetails' && isGameDetailsPage && (isDesktop || isLandscape);
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
        className={`relative px-2 ${!scrollablePage ? 'min-h-0 overflow-hidden' : ''} ${
          isTeamsPage ? `flex flex-col ${teamsShellHeightClass}` : ''
        }`}
        style={{ paddingBottom: bottomTabsVisible && !isTeamsPage ? '5rem' : '0' }}
      >
        <div
          className={`transition-all duration-300 ease-in-out transform translate-x-0 opacity-100 ${
            isTeamsPage ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : ''
          }`}
        >
          {renderContent}
        </div>
      </div>
      {bottomTabsVisible && <BottomTabBar animateEntry={animateShellEntry} />}
    </MainLayout>
  );
};
