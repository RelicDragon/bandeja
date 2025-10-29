import { useTranslation } from 'react-i18next';
import { Bell, MessageCircle, User, ArrowLeft, Bug } from 'lucide-react';
import { useHeaderStore } from '@/store/headerStore';
import { useNavigationStore } from '../store/navigationStore';
import { useNavigate } from 'react-router-dom';
import {
  HeaderContentWrapper,
  HomeHeaderContent,
  ProfileHeaderContent,
  GameDetailsHeaderContent,
  BugHeaderContent
} from '@/components';

interface HeaderProps {
  showChatFilter?: boolean;
  onChatFilterToggle?: () => void;
  // Profile page props
  profileEditMode?: boolean;
  onProfileEditModeToggle?: () => void;
  onProfileSaveChanges?: () => void;
  profileSaveDisabled?: boolean;
}

export const Header = ({ 
  showChatFilter = false, 
  onChatFilterToggle,
  profileEditMode = false,
  onProfileEditModeToggle,
  onProfileSaveChanges,
  profileSaveDisabled = false
}: HeaderProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pendingInvites, unreadMessages } = useHeaderStore();
  const { currentPage, setCurrentPage, setIsAnimating, gameDetailsCanAccessChat } = useNavigationStore();

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
    setIsAnimating(true);
    setCurrentPage('bugs');
    navigate('/bugs', { replace: true });
    setTimeout(() => setIsAnimating(false), 300);
  };

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 h-16 fixed top-0 right-0 left-0 z-40 shadow-lg">
      <div className="h-full px-4 flex">
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
            <button className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <Bell size={20} className="text-gray-600 dark:text-gray-400" />
              <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {pendingInvites}
              </span>
            </button>
          )}

          {(unreadMessages > 0 || showChatFilter) && (
            <button
              onClick={() => {
                if (onChatFilterToggle) {
                  onChatFilterToggle();
                } else {
                  // If we're not on the home page, navigate to home with chat filter enabled
                  navigate('/', { state: { showChatFilter: true } });
                }
              }}
              className={`relative p-2 rounded-lg transition-colors ${
                showChatFilter
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <MessageCircle
                size={20}
                className={showChatFilter ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'}
                fill={showChatFilter ? 'currentColor' : 'none'}
              />
              {unreadMessages > 0 && (
                <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadMessages > 99 ? '99+' : unreadMessages}
                </span>
              )}
            </button>
          )}

          {currentPage !== 'bugs' && (
            <button
              onClick={handleBugClick}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={t('bug.bugTracker')}
            >
              <Bug size={20} className="text-gray-600 dark:text-gray-400" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-4 relative ml-auto">
          {/* Content wrappers for different pages */}
          <HeaderContentWrapper page="home">
            <HomeHeaderContent />
          </HeaderContentWrapper>

          <HeaderContentWrapper page="profile">
            <ProfileHeaderContent
              isEditMode={profileEditMode}
              onEditModeToggle={onProfileEditModeToggle || (() => {})}
              onSaveChanges={onProfileSaveChanges || (() => {})}
              disabled={profileSaveDisabled}
            />
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
  );
};

