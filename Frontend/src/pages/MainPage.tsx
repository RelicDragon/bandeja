import { useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { MainLayout } from '@/layouts/MainLayout';
import { useNavigationStore } from '@/store/navigationStore';
import { BottomTabBar } from '@/components/navigation/BottomTabBar';
import { MyTab } from './MyTab';
import { FindTab } from './FindTab';
import { ChatsTab } from './ChatsTab';
import { LeaderboardTab } from './LeaderboardTab';
import { ProfileTab } from './ProfileTab';
import { GameDetailsContent } from './GameDetails';
import { GameSubscriptionsContent } from './GameSubscriptions';

export const MainPage = () => {
  const location = useLocation();
  const { currentPage, setCurrentPage, setIsAnimating, bottomTabsVisible } = useNavigationStore();
  const previousPathnameRef = useRef(location.pathname);
  const isInitialMountRef = useRef(true);

  useEffect(() => {
    const path = location.pathname;
    const previousPath = previousPathnameRef.current;
    const isPathChanged = path !== previousPath;

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
      } else if (path === '/') {
        setCurrentPage('my');
      }

      if (isPathChanged) {
        setTimeout(() => setIsAnimating(false), 300);
      }
      
      previousPathnameRef.current = path;
      isInitialMountRef.current = false;
    }
  }, [location.pathname, setCurrentPage, setIsAnimating]);

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
        return <GameDetailsContent />;
      case 'gameSubscriptions':
        return <GameSubscriptionsContent />;
      default:
        return <MyTab />;
    }
  }, [currentPage]);

  if (currentPage === 'chats') {
    return (
      <MainLayout>
        <ChatsTab />
        {bottomTabsVisible && <BottomTabBar />}
      </MainLayout>
    );
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
