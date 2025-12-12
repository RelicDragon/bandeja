import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { MainLayout } from '@/layouts/MainLayout';
import { useNavigationStore } from '@/store/navigationStore';
import { HomeContent } from './Home';
import { ProfileContent } from './Profile';
import { GameDetailsContent } from './GameDetails';
import { BugsContent } from './Bugs';

export const MainPage = () => {
  const location = useLocation();
  const { currentPage, setCurrentPage, setIsAnimating } = useNavigationStore();
  const previousPathnameRef = useRef(location.pathname);

  useEffect(() => {
    const path = location.pathname;
    const previousPath = previousPathnameRef.current;
    const isPathChanged = path !== previousPath;

    if (isPathChanged) {
      setIsAnimating(true);
      
      if (path === '/profile') {
        setCurrentPage('profile');
      } else if (path === '/bugs') {
        setCurrentPage('bugs');
      } else if (path.startsWith('/games/') && !path.includes('/chat')) {
        setCurrentPage('gameDetails');
      } else if (path === '/') {
        setCurrentPage('home');
      }

      setTimeout(() => setIsAnimating(false), 300);
      previousPathnameRef.current = path;
    }
  }, [location.pathname, setCurrentPage, setIsAnimating]);

  return (
    <MainLayout>
      <div className="relative px-2 overflow-hidden">
        {/* Home Page */}
        <div className={`transition-all duration-300 ease-in-out ${
          currentPage === 'home' 
            ? 'opacity-100 transform translate-x-0' 
            : 'opacity-0 transform -translate-x-full absolute inset-0'
        }`}>
          <HomeContent />
        </div>

        {/* Profile Page */}
        <div className={`transition-all duration-300 ease-in-out ${
          currentPage === 'profile' 
            ? 'opacity-100 transform translate-x-0' 
            : 'opacity-0 transform translate-x-full absolute inset-0'
        }`}>
          <ProfileContent />
        </div>

        {/* Game Details Page */}
        <div className={`transition-all duration-300 ease-in-out ${
          currentPage === 'gameDetails'
            ? 'opacity-100 transform translate-x-0'
            : 'opacity-0 transform translate-x-full absolute inset-0'
        }`}>
          <GameDetailsContent />
        </div>

        {/* Bugs Page */}
        <div className={`transition-all duration-300 ease-in-out ${
          currentPage === 'bugs'
            ? 'opacity-100 transform translate-x-0'
            : 'opacity-0 transform translate-x-full absolute inset-0'
        }`}>
          <BugsContent />
        </div>
      </div>
    </MainLayout>
  );
};
