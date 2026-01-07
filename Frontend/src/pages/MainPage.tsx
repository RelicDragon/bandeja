import { useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { MainLayout } from '@/layouts/MainLayout';
import { useNavigationStore } from '@/store/navigationStore';
import { HomeContent } from './Home';
import { ProfileContent } from './Profile';
import { GameDetailsContent } from './GameDetails';
import { BugsContent } from './Bugs';
import { GameSubscriptionsContent } from './GameSubscriptions';

export const MainPage = () => {
  const location = useLocation();
  const { currentPage, setCurrentPage, setIsAnimating } = useNavigationStore();
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
      } else if (path === '/bugs') {
        setCurrentPage('bugs');
      } else if (path === '/game-subscriptions') {
        setCurrentPage('gameSubscriptions');
      } else if (path.startsWith('/games/') && !path.includes('/chat')) {
        setCurrentPage('gameDetails');
      } else if (path === '/') {
        setCurrentPage('home');
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
      case 'home':
        return <HomeContent />;
      case 'profile':
        return <ProfileContent />;
      case 'gameDetails':
        return <GameDetailsContent />;
      case 'bugs':
        return <BugsContent />;
      case 'gameSubscriptions':
        return <GameSubscriptionsContent />;
      default:
        return <HomeContent />;
    }
  }, [currentPage]);

  return (
    <MainLayout>
      <div className="relative px-2 overflow-hidden">
        <div className="transition-all duration-300 ease-in-out opacity-100 transform translate-x-0">
          {renderContent}
        </div>
      </div>
    </MainLayout>
  );
};
