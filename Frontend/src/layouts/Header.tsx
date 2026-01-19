import { useTranslation } from 'react-i18next';
import { useEffect, useRef } from 'react';
import { Bell, ArrowLeft } from 'lucide-react';
import { useHeaderStore } from '@/store/headerStore';
import { useNavigationStore } from '../store/navigationStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';
import {
  HomeHeaderContent,
  GameDetailsHeaderContent,
  GameModeToggle,
  MyGamesTabController,
  ProfileTabController,
  LeaderboardTabController
} from '@/components';
import { GameSubscriptionsHeaderContent } from '@/components/headerContent/GameSubscriptionsHeaderContent';
import { ChatsTabController } from '@/components/headerContent/ChatsTabController';
import { FindTabController } from '@/components/headerContent/FindTabController';

export const Header = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { pendingInvites, isNewInviteAnimating } = useHeaderStore();
  const { currentPage, setCurrentPage, setIsAnimating, gameDetailsCanAccessChat, setBounceNotifications } = useNavigationStore();
  
  const locationState = location.state as { fromLeagueSeasonGameId?: string } | null;

  const previousPageRef = useRef(currentPage);

  useEffect(() => {
    previousPageRef.current = currentPage;
  }, [currentPage]);

  useBackButtonHandler();

  const handleBackClick = () => {
    setIsAnimating(true);
    
    if (currentPage === 'gameDetails') {
      navigate(-1);
    } else if (locationState?.fromLeagueSeasonGameId) {
      setCurrentPage('gameDetails');
      navigate(`/games/${locationState.fromLeagueSeasonGameId}`, { replace: true });
    } else {
      setCurrentPage('my');
      navigate('/', { replace: true });
    }
    
    setTimeout(() => setIsAnimating(false), 300);
  };

  const handleNotificationsClick = async () => {
    setIsAnimating(true);
    setBounceNotifications(true);
    setCurrentPage('my');
    navigate('/', { replace: true });
    setTimeout(() => setIsAnimating(false), 300);
  };

  return (
    <>
      <header 
        className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 fixed top-0 right-0 left-0 z-40 shadow-lg transition-all duration-300" 
        style={{ 
          paddingTop: 'env(safe-area-inset-top)', 
          height: `calc(4rem + env(safe-area-inset-top))`
        }}
      >
        <div className="h-16 px-4 flex" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
          <div className="flex items-center gap-3">
            {(currentPage === 'my' || currentPage === 'find' || currentPage === 'chats' || currentPage === 'profile' || currentPage === 'leaderboard') ? null : (
              <button
                onClick={handleBackClick}
                className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg font-medium transition-all duration-200 hover:scale-105 active:scale-110 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 border-0 outline-none focus:border-0 focus:outline-none focus:ring-0 focus:shadow-none focus:bg-transparent focus:text-current  focus:transform focus:box-border active:border-0 active:outline-none active:ring-0 active:shadow-none active:bg-transparent active:text-current"
              >
                <ArrowLeft size={20} />
                {t('common.back')}
              </button>
            )}
            
            {pendingInvites > 0 && (
              <button
                onClick={handleNotificationsClick}
                className={`relative p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 hover:scale-105 active:scale-110 border-0 outline-none focus:border-0 focus:outline-none focus:ring-0 focus:shadow-none focus:bg-transparent focus:text-current focus:transform focus:box-border active:border-0 active:outline-none active:ring-0 active:shadow-none active:bg-transparent active:text-current ${
                  isNewInviteAnimating ? 'animate-pulse animate-bounce' : ''
                }`}
              >
                <Bell size={20} className="text-gray-600 dark:text-gray-400" />
                <span className={`absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center transition-all duration-300 ${
                  isNewInviteAnimating ? 'animate-ping scale-110' : ''
                }`}>
                  {pendingInvites}
                </span>
              </button>
            )}

            {currentPage === 'my' && <MyGamesTabController />}
            {currentPage === 'find' && <FindTabController />}
            {currentPage === 'chats' && <ChatsTabController />}
            {currentPage === 'profile' && <ProfileTabController />}
            {currentPage === 'leaderboard' && <LeaderboardTabController />}
          </div>

          <div className="flex items-center gap-4 relative ml-auto">
            {(currentPage === 'my' || currentPage === 'find' || currentPage === 'chats' || currentPage === 'profile' || currentPage === 'leaderboard') && (
              <HomeHeaderContent />
            )}

            {currentPage === 'gameDetails' && (
              <GameDetailsHeaderContent canAccessChat={gameDetailsCanAccessChat} />
            )}

            {currentPage === 'gameSubscriptions' && (
              <GameSubscriptionsHeaderContent />
            )}
          </div>
        </div>
      </header>
      {currentPage !== 'profile' && <GameModeToggle />}
    </>
  );
};

