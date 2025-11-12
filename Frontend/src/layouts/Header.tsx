import { useTranslation } from 'react-i18next';
import { useEffect, useRef } from 'react';
import { Bell, MessageCircle, User, ArrowLeft, Bug } from 'lucide-react';
import { useHeaderStore } from '@/store/headerStore';
import { useNavigationStore } from '../store/navigationStore';
import { useNavigate } from 'react-router-dom';
import {
  HeaderContentWrapper,
  HomeHeaderContent,
  GameDetailsHeaderContent,
  BugHeaderContent,
  GameModeToggle
} from '@/components';

interface HeaderProps {
  showChatFilter?: boolean;
  onChatFilterToggle?: () => void;
}

export const Header = ({ 
  showChatFilter = false, 
  onChatFilterToggle
}: HeaderProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pendingInvites, unreadMessages, isNewInviteAnimating, showChatFilter: globalShowChatFilter, setShowChatFilter } = useHeaderStore();
  const { currentPage, setCurrentPage, setIsAnimating, gameDetailsCanAccessChat, setBounceNotifications, bugsButtonSlidingUp, bugsButtonSlidingDown, setBugsButtonSlidingUp, setBugsButtonSlidingDown } = useNavigationStore();
  
  const isChatFilterActive = onChatFilterToggle ? showChatFilter : globalShowChatFilter;

  const previousPageRef = useRef(currentPage);

  // Handle page transitions
  useEffect(() => {
    const previousPage = previousPageRef.current;
    
    // Trigger bugs button slide-down animation when navigating away from bugs page
    if (previousPage === 'bugs' && currentPage !== 'bugs') {
      setBugsButtonSlidingDown(true);
      setTimeout(() => setBugsButtonSlidingDown(false), 500);
    }
    
    // Turn off chat filter when navigating away from home
    if (previousPage === 'home' && currentPage !== 'home') {
      if (!onChatFilterToggle) {
        setShowChatFilter(false);
      }
    }
    
    previousPageRef.current = currentPage;
  }, [currentPage, setBugsButtonSlidingDown, setShowChatFilter, onChatFilterToggle]);

  const handleProfileClick = () => {
    setIsAnimating(true);
    setCurrentPage('profile');
    navigate('/profile', { replace: true });
    setTimeout(() => setIsAnimating(false), 300);
  };

  const handleBackClick = () => {
    setIsAnimating(true);
    setCurrentPage('home');
    navigate('/', { replace: true });
    setTimeout(() => setIsAnimating(false), 300);
  };

  const handleBugClick = () => {
    // Start slide-up animation
    setBugsButtonSlidingUp(true);

    // Trigger page navigation after slide-up animation
    setTimeout(() => {
      setIsAnimating(true);
      setCurrentPage('bugs');
      navigate('/bugs', { replace: true });
      setTimeout(() => setIsAnimating(false), 300);
    }, 200); // Small delay for slide-up effect

    // Reset slide-up state after animation completes
    setTimeout(() => setBugsButtonSlidingUp(false), 1000);
  };

  const handleNotificationsClick = () => {
    setIsAnimating(true);
    setBounceNotifications(true);
    setCurrentPage('home');
    navigate('/', { replace: true });
    setTimeout(() => setIsAnimating(false), 300);
  };

  return (
    <>
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 fixed top-0 right-0 left-0 z-40 shadow-lg" style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(4rem + env(safe-area-inset-top))' }}>
        <div className="h-16 px-4 flex" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
          <div className="flex items-center gap-2">
            {currentPage === 'home' ? (
              <button
                onClick={handleProfileClick}
                className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg font-medium transition-all duration-200 hover:scale-105 active:scale-110 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 border-0 outline-none focus:border-0 focus:outline-none focus:ring-0 focus:shadow-none focus:bg-transparent focus:text-current  focus:transform focus:box-border active:border-0 active:outline-none active:ring-0 active:shadow-none active:bg-transparent active:text-current"
              >
                <User size={20} />
                {t('nav.profile')}
              </button>
            ) : (
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
                className={`relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 hover:scale-105 active:scale-110 border-0 outline-none focus:border-0 focus:outline-none focus:ring-0 focus:shadow-none focus:bg-transparent focus:text-current focus:transform focus:box-border active:border-0 active:outline-none active:ring-0 active:shadow-none active:bg-transparent active:text-current ${
                  isNewInviteAnimating ? 'animate-pulse animate-bounce' : ''
                }`}
              >
                <Bell size={20} className="text-gray-600 dark:text-gray-400" />
                <span className={`absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center transition-all duration-300 ${
                  isNewInviteAnimating ? 'animate-ping scale-110' : ''
                }`}>
                  {pendingInvites}
                </span>
              </button>
            )}

            {(unreadMessages > 0 || isChatFilterActive) && (
              <button
                onClick={() => {
                  if (currentPage !== 'home') {
                    setIsAnimating(true);
                    setCurrentPage('home');
                    navigate('/', { replace: true });
                    setTimeout(() => {
                      setIsAnimating(false);
                      setShowChatFilter(true);
                    }, 300);
                  } else {
                    if (onChatFilterToggle) {
                      onChatFilterToggle();
                    } else {
                      setShowChatFilter(!globalShowChatFilter);
                    }
                  }
                }}
                className={`relative p-2 rounded-lg transition-colors ${
                  isChatFilterActive
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <MessageCircle
                  size={20}
                  className={isChatFilterActive ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'}
                  fill={isChatFilterActive ? 'currentColor' : 'none'}
                />
                {unreadMessages > 0 && !isChatFilterActive && (
                  <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {unreadMessages > 99 ? '99+' : unreadMessages}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={handleBugClick}
              className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 hover:scale-105 active:scale-110 border-0 outline-none focus:border-0 focus:outline-none focus:ring-0 focus:shadow-none focus:bg-transparent focus:text-current focus:transform focus:box-border active:border-0 active:outline-none active:ring-0 active:shadow-none active:bg-transparent active:text-current ${bugsButtonSlidingUp || currentPage === 'bugs' ? 'transform -translate-y-8 opacity-0' : ''} ${bugsButtonSlidingDown ? 'transform translate-y-8 opacity-0' : ''}`}
              title={t('bug.bugTracker')}
            >
              <Bug size={20} className={`text-gray-600 dark:text-gray-400 transition-all duration-500 ${bugsButtonSlidingUp || bugsButtonSlidingDown || currentPage === 'bugs' ? 'opacity-0' : 'opacity-100'}`} />
            </button>
          </div>

          <div className="flex items-center gap-4 relative ml-auto">
            {/* Content wrappers for different pages */}
            <HeaderContentWrapper page="home">
              <HomeHeaderContent />
            </HeaderContentWrapper>

            <HeaderContentWrapper page="gameDetails">
              <GameDetailsHeaderContent canAccessChat={gameDetailsCanAccessChat} />
            </HeaderContentWrapper>

            <HeaderContentWrapper page="bugs">
              <BugHeaderContent />
            </HeaderContentWrapper>
          </div>
        </div>
      </header>
      {currentPage !== 'profile' && <GameModeToggle />}
    </>
  );
};

