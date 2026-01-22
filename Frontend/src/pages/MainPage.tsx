import { useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/layouts/MainLayout';
import { useNavigationStore } from '@/store/navigationStore';
import { BottomTabBar } from '@/components/navigation/BottomTabBar';
import { useDesktop } from '@/hooks/useDesktop';
import { MyTab } from './MyTab';
import { FindTab } from './FindTab';
import { ChatsTab } from './ChatsTab';
import { BugsTab } from './BugsTab';
import { LeaderboardTab } from './LeaderboardTab';
import { ProfileTab } from './ProfileTab';
import { GameDetailsContent } from './GameDetails';
import { GameSubscriptionsContent } from './GameSubscriptions';

export const MainPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentPage, setCurrentPage, setIsAnimating, bottomTabsVisible, chatsFilter, setChatsFilter } = useNavigationStore();
  const previousPathnameRef = useRef(location.pathname);
  const isInitialMountRef = useRef(true);
  const isDesktop = useDesktop();

  useEffect(() => {
    const path = location.pathname;
    const previousPath = previousPathnameRef.current;
    const isPathChanged = path !== previousPath;
    const locationState = location.state as { fromPage?: 'my' | 'find' | 'chats' | 'bugs' | 'profile' | 'leaderboard' | 'gameDetails' | 'gameSubscriptions' } | null;

    if (isPathChanged || isInitialMountRef.current) {
      if (isPathChanged) {
        setIsAnimating(true);
      }
      
      if (path === '/profile') {
        setCurrentPage('profile');
      } else if (path === '/chats') {
        setCurrentPage('chats');
      } else if (path === '/find') {
        setCurrentPage('find');
      } else if (path === '/leaderboard') {
        setCurrentPage('leaderboard');
      } else if (path === '/game-subscriptions') {
        setCurrentPage('gameSubscriptions');
      } else if (path.startsWith('/games/') && !path.includes('/chat')) {
        setCurrentPage('gameDetails');
      } else if (path === '/bugs') {
        setCurrentPage('bugs');
      } else if (path.includes('/bugs/') && path.includes('/chat')) {
        setCurrentPage('bugs');
      } else if (path.includes('/user-chat/')) {
        setCurrentPage('chats');
        setChatsFilter('users');
      } else if (path.includes('/group-chat/')) {
        setCurrentPage('chats');
        setChatsFilter('users');
      } else if (path.includes('/channel-chat/')) {
        setCurrentPage('chats');
        setChatsFilter('channels');
      } else if (path === '/') {
        if (locationState?.fromPage && previousPath?.startsWith('/games/')) {
          setCurrentPage(locationState.fromPage);
          if (locationState.fromPage === 'find') {
            setIsAnimating(true);
            setTimeout(() => {
              navigate('/find', { replace: true });
              setIsAnimating(false);
            }, 0);
          }
        } else {
          setCurrentPage('my');
        }
      } else {
        setCurrentPage('my');
      }

      if (isPathChanged) {
        setTimeout(() => setIsAnimating(false), 300);
      }
      
      previousPathnameRef.current = path;
      isInitialMountRef.current = false;
    }
  }, [location.pathname, location.state, setCurrentPage, setIsAnimating, setChatsFilter, navigate]);

  const renderContent = useMemo(() => {
    switch (currentPage) {
      case 'my':
        return <MyTab />;
      case 'find':
        return <FindTab />;
      case 'chats':
        return <ChatsTab />;
      case 'bugs':
        return <BugsTab />;
      case 'leaderboard':
        return <LeaderboardTab />;
      case 'profile':
        return <ProfileTab />;
      case 'gameDetails':
        return <GameDetailsContent />;
      case 'gameSubscriptions':
        return <GameSubscriptionsContent />;
      default:
        return <MyTab />;
    }
  }, [currentPage]);

  const isChatPage = currentPage === 'chats';
  const isBugsPage = currentPage === 'bugs';
  const isOnSpecificChatRoute = location.pathname.includes('/user-chat/') || 
                                 location.pathname.includes('/group-chat/') || 
                                 location.pathname.includes('/channel-chat/') || 
                                 (location.pathname.includes('/bugs/') && location.pathname.includes('/chat'));
  const shouldShowChatsSplitView = isChatPage && (isDesktop || !isOnSpecificChatRoute);
  const shouldShowBugsSplitView = isBugsPage && (isDesktop || !isOnSpecificChatRoute);
  const showBottomTabBar = bottomTabsVisible && (!isDesktop || (isChatPage && chatsFilter === 'bugs'));

  if (isChatPage && shouldShowChatsSplitView) {
    return (
      <MainLayout>
        <ChatsTab />
        {showBottomTabBar && <BottomTabBar />}
      </MainLayout>
    );
  }

  if (isBugsPage && shouldShowBugsSplitView) {
    return (
      <MainLayout>
        <BugsTab />
        {showBottomTabBar && <BottomTabBar />}
      </MainLayout>
    );
  }

  if ((isChatPage || isBugsPage) && !isDesktop && isOnSpecificChatRoute) {
    if (isBugsPage) {
      return <BugsTab />;
    }
    return <ChatsTab />;
  }

  return (
    <MainLayout>
      <div className="relative px-2 overflow-hidden" style={{ paddingBottom: bottomTabsVisible ? '5rem' : '0' }}>
        <div className="transition-all duration-300 ease-in-out opacity-100 transform translate-x-0">
          {renderContent}
        </div>
      </div>
      {bottomTabsVisible && <BottomTabBar />}
    </MainLayout>
  );
};
