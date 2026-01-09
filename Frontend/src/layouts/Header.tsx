import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { Bell, MessageCircle, User, ArrowLeft, Bug, BookUser } from 'lucide-react';
import { useHeaderStore } from '@/store/headerStore';
import { useNavigationStore } from '../store/navigationStore';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  HeaderContentWrapper,
  HomeHeaderContent,
  GameDetailsHeaderContent,
  BugHeaderContent,
  ProfileHeaderContent,
  GameModeToggle
} from '@/components';
import { GameSubscriptionsHeaderContent } from '@/components/headerContent/GameSubscriptionsHeaderContent';
import { GamesTabController } from '@/components/home/GamesTabController';
import { Contacts } from '@/components/home/Contacts';
import { getContactsVisibility, setContactsVisibility } from '@/utils/contactsVisibilityStorage';
import { usePlayersStore } from '@/store/playersStore';
import { useAuthStore } from '@/store/authStore';

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
  const location = useLocation();
  const { pendingInvites, unreadMessages, isNewInviteAnimating, showChatFilter: globalShowChatFilter, setShowChatFilter, showContacts, setShowContacts, contactsHeight, setContactsHeight } = useHeaderStore();
  const { currentPage, setCurrentPage, setIsAnimating, gameDetailsCanAccessChat, setBounceNotifications, bugsButtonSlidingUp, bugsButtonSlidingDown, setBugsButtonSlidingUp, setBugsButtonSlidingDown, activeTab, setActiveTab } = useNavigationStore();
  const user = useAuthStore((state) => state.user);
  const getUnreadUserChatsCount = usePlayersStore((state) => state.getUnreadUserChatsCount);
  const fetchUnreadCounts = usePlayersStore((state) => state.fetchUnreadCounts);
  const fetchUserChats = usePlayersStore((state) => state.fetchUserChats);
  
  const isChatFilterActive = onChatFilterToggle ? showChatFilter : globalShowChatFilter;
  const locationState = location.state as { fromLeagueSeasonGameId?: string } | null;

  const previousPageRef = useRef(currentPage);
  const previousTabRef = useRef(activeTab);
  const [contactsLoading, setContactsLoading] = useState(true);
  const contactsContainerRef = useRef<HTMLDivElement>(null);
  const contactsContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    const loadContactsVisibility = async () => {
      try {
        const visible = await getContactsVisibility();
        if (mounted) {
          setShowContacts(visible);
        }
      } catch (error) {
        console.error('Failed to load contacts visibility:', error);
      } finally {
        if (mounted) {
          setContactsLoading(false);
        }
      }
    };
    loadContactsVisibility();
    return () => {
      mounted = false;
    };
  }, [setShowContacts]);

  useEffect(() => {
    if (!contactsContentRef.current || !showContacts || contactsLoading) {
      setContactsHeight(0);
      return;
    }

    let rafId: number;
    let lastHeight = 0;
    let isMeasuring = false;

    const measureHeight = () => {
      if (contactsContentRef.current && contactsContainerRef.current && !isMeasuring) {
        isMeasuring = true;
        rafId = requestAnimationFrame(() => {
          if (contactsContentRef.current && contactsContainerRef.current) {
            const tempMaxHeight = contactsContainerRef.current.style.maxHeight;
            contactsContainerRef.current.style.maxHeight = 'none';
            const height = contactsContentRef.current.offsetHeight;
            contactsContainerRef.current.style.maxHeight = tempMaxHeight;
            
            if (Math.abs(height - lastHeight) > 2) {
              setContactsHeight(height);
              lastHeight = height;
            }
          }
          isMeasuring = false;
        });
      }
    };

    measureHeight();

    const resizeObserver = new ResizeObserver(() => {
      measureHeight();
    });

    resizeObserver.observe(contactsContentRef.current);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, [showContacts, contactsLoading, setContactsHeight]);

  const handleContactsToggle = async () => {
    const newVisibility = !showContacts;
    
    if (newVisibility && isChatFilterActive) {
      const unreadUserChatsCount = getUnreadUserChatsCount();
      if (unreadUserChatsCount === 0) {
        return;
      }
    }
    
    setShowContacts(newVisibility);
    try {
      await setContactsVisibility(newVisibility);
    } catch (error) {
      console.error('Failed to save contacts visibility:', error);
    }
  };

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
    
    // Turn off contacts when navigating to another page
    if (previousPage !== currentPage && showContacts) {
      setShowContacts(false);
      setContactsVisibility(false).catch((error) => {
        console.error('Failed to save contacts visibility:', error);
      });
    }
    
    previousPageRef.current = currentPage;
  }, [currentPage, setBugsButtonSlidingDown, setShowChatFilter, onChatFilterToggle, showContacts, setShowContacts]);

  // Handle tab changes on home page
  useEffect(() => {
    const previousTab = previousTabRef.current;
    
    // Turn off contacts when switching tabs on home page
    if (currentPage === 'home' && previousTab !== activeTab && showContacts) {
      setShowContacts(false);
      setContactsVisibility(false).catch((error) => {
        console.error('Failed to save contacts visibility:', error);
      });
    }
    
    previousTabRef.current = activeTab;
  }, [activeTab, currentPage, showContacts, setShowContacts]);

  const handleProfileClick = () => {
    setIsAnimating(true);
    setCurrentPage('profile');
    navigate('/profile', { replace: true });
    setTimeout(() => setIsAnimating(false), 300);
  };

  const handleBackClick = () => {
    setIsAnimating(true);
    
    if (currentPage === 'gameDetails' && locationState?.fromLeagueSeasonGameId) {
      setCurrentPage('gameDetails');
      navigate(`/games/${locationState.fromLeagueSeasonGameId}`, { replace: true });
    } else {
      setCurrentPage('home');
      navigate('/', { replace: true });
    }
    
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

  const handleNotificationsClick = async () => {
    if (isChatFilterActive) {
      if (onChatFilterToggle) {
        onChatFilterToggle();
      } else {
        setShowChatFilter(false);
      }
    }
    if (showContacts) {
      setShowContacts(false);
      try {
        await setContactsVisibility(false);
      } catch (error) {
        console.error('Failed to save contacts visibility:', error);
      }
    }
    setIsAnimating(true);
    setBounceNotifications(true);
    setCurrentPage('home');
    navigate('/', { replace: true });
    setTimeout(() => setIsAnimating(false), 300);
  };

  const isTabControllerVisible = currentPage === 'home' && !isChatFilterActive;
  const contactsVisible = showContacts && !contactsLoading;
  const contactsHeightPx = contactsVisible ? contactsHeight : 0;
  const tabControllerHeight = isTabControllerVisible ? '3.5rem' : '0';

  return (
    <>
      <header 
        className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 fixed top-0 right-0 left-0 z-40 shadow-lg transition-all duration-300" 
        style={{ 
          paddingTop: 'env(safe-area-inset-top)', 
          height: `calc(4rem + ${contactsHeightPx}px + ${tabControllerHeight} + env(safe-area-inset-top))`
        }}
      >
        <div className="h-16 px-4 flex" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
          <div className="flex items-center">
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

            <button
              onClick={handleContactsToggle}
              className={`rounded-lg transition-all duration-200 hover:scale-105 active:scale-110 border-0 outline-none focus:border-0 focus:outline-none focus:ring-0 focus:shadow-none focus:transform focus:box-border active:border-0 active:outline-none active:ring-0 active:shadow-none ${
                showContacts
                  ? 'bg-primary-500 dark:bg-primary-600 shadow-md active:bg-primary-600 dark:active:bg-primary-700'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600'
              }`}
              title={t('contacts.title', { defaultValue: 'Contacts' })}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                minWidth: '2.5rem',
                minHeight: '2.5rem'
              }}
            >
              <BookUser 
                size={20} 
                style={{ 
                  display: 'block',
                  color: showContacts ? 'white' : undefined,
                  opacity: 1,
                  pointerEvents: 'none'
                }}
                className={showContacts ? '' : 'text-gray-600 dark:text-gray-400'} 
              />
            </button>


            {(unreadMessages > 0 || isChatFilterActive) && (
              <button
                onClick={async () => {
                  if (currentPage !== 'home') {
                    setIsAnimating(true);
                    setCurrentPage('home');
                    navigate('/', { replace: true });
                    setTimeout(async () => {
                      setIsAnimating(false);
                      setShowChatFilter(true);
                      if (user?.id) {
                        await fetchUserChats();
                        await fetchUnreadCounts();
                      }
                      const unreadUserChatsCount = getUnreadUserChatsCount();
                      if (unreadUserChatsCount > 0 && !showContacts) {
                        setShowContacts(true);
                        try {
                          await setContactsVisibility(true);
                        } catch (error) {
                          console.error('Failed to save contacts visibility:', error);
                        }
                      } else if (unreadUserChatsCount === 0 && showContacts) {
                        setShowContacts(false);
                        try {
                          await setContactsVisibility(false);
                        } catch (error) {
                          console.error('Failed to save contacts visibility:', error);
                        }
                      }
                    }, 300);
                  } else {
                    const willBeActive = !isChatFilterActive;
                    if (onChatFilterToggle) {
                      onChatFilterToggle();
                    } else {
                      setShowChatFilter(!globalShowChatFilter);
                    }
                    if (willBeActive) {
                      if (user?.id) {
                        await fetchUserChats();
                        await fetchUnreadCounts();
                      }
                      const unreadUserChatsCount = getUnreadUserChatsCount();
                      if (unreadUserChatsCount > 0 && !showContacts) {
                        setShowContacts(true);
                        try {
                          await setContactsVisibility(true);
                        } catch (error) {
                          console.error('Failed to save contacts visibility:', error);
                        }
                      } else if (unreadUserChatsCount === 0 && showContacts) {
                        setShowContacts(false);
                        try {
                          await setContactsVisibility(false);
                        } catch (error) {
                          console.error('Failed to save contacts visibility:', error);
                        }
                      }
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

            <HeaderContentWrapper page="profile">
              <ProfileHeaderContent />
            </HeaderContentWrapper>

            <HeaderContentWrapper page="gameSubscriptions">
              <GameSubscriptionsHeaderContent />
            </HeaderContentWrapper>
          </div>
        </div>
        <div
          ref={contactsContainerRef}
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            showContacts && !contactsLoading
              ? 'opacity-100 translate-y-0'
              : 'max-h-0 opacity-0 -translate-y-4'
          }`}
          style={{
            maxHeight: showContacts && !contactsLoading ? `${contactsHeight}px` : '0'
          }}
        >
          <div 
            ref={contactsContentRef}
            className="px-4 py-2" 
            style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}
          >
            <Contacts />
          </div>
        </div>
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            isTabControllerVisible
              ? 'max-h-16 opacity-100 translate-y-0'
              : 'max-h-0 opacity-0 -translate-y-4'
          }`}
        >
          <div className="px-4 pb-0 mx-auto max-w-2xl" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
            <GamesTabController activeTab={activeTab} onTabChange={setActiveTab} />
          </div>
        </div>
      </header>
      {currentPage !== 'profile' && <GameModeToggle />}
    </>
  );
};

