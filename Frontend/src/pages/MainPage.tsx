import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { MainLayout } from '@/layouts/MainLayout';
import { useNavigationStore } from '@/store/navigationStore';
import { BottomTabBar } from '@/components/navigation/BottomTabBar';
import { useDesktop } from '@/hooks/useDesktop';
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
  const { bottomTabsVisible, initShellAnimationPlayed } = useNavigationStore();
  const isDesktop = useDesktop();
  const animateShellEntry = location.pathname === '/' && !initShellAnimationPlayed;

  const parsed = useMemo(
    () => parseLocation(location.pathname, location.search),
    [location.pathname, location.search]
  );

  const currentPage = placeToPageType(parsed.place);

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
  if (currentPage === 'gameDetails' && isDesktop && isGameDetailsPage) {
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

  return (
    <MainLayout>
      <div className={`relative px-2 
        ${currentPage !== 'my' && currentPage != 'find' 
          ?'overflow-hidden':''}`} 
          style={{ paddingBottom: bottomTabsVisible ? '5rem' : '0' }}>
        <div className="transition-all duration-300 ease-in-out opacity-100 transform translate-x-0">
          {renderContent}
        </div>
      </div>
      {bottomTabsVisible && <BottomTabBar animateEntry={animateShellEntry} />}
    </MainLayout>
  );
};
