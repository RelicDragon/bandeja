import { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, User } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { CreateMenuModal } from '@/components/CreateMenuModal';
import { useNavigationStore } from '@/store/navigationStore';
import { EntityType } from '@/types';
import { useNavigate, useLocation } from 'react-router-dom';
import { handleBackNavigation } from '@/utils/navigation';

export const HomeHeaderContent = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const { currentPage, setCurrentPage, setIsAnimating, setChatsFilter } = useNavigationStore();
  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [pendingChatType, setPendingChatType] = useState<'group' | 'channel' | null>(null);
  const [showChatForm, setShowChatForm] = useState(false);
  const [activeChatType, setActiveChatType] = useState<'group' | 'channel' | null>(null);

  useEffect(() => {
    if (pendingChatType && currentPage === 'chats') {
      if (pendingChatType === 'channel') {
        setChatsFilter('channels');
      } else {
        setChatsFilter('users');
      }
      setActiveChatType(pendingChatType);
      setPendingChatType(null);
      setTimeout(() => {
        setShowChatForm(true);
      }, 100);
    }
  }, [currentPage, pendingChatType, setChatsFilter]);

  const handleSelectGameType = (entityType: EntityType) => {
    if (currentPage !== 'my') {
      setIsAnimating(true);
      setCurrentPage('my');
      navigate('/', { replace: true });
      setTimeout(() => {
        setIsAnimating(false);
        if (entityType === 'LEAGUE') {
          navigate('/create-league', { replace: true });
        } else {
          navigate('/create-game', { state: { entityType }, replace: true });
        }
      }, 300);
    } else {
      if (entityType === 'LEAGUE') {
        navigate('/create-league', { replace: true });
      } else {
        navigate('/create-game', { state: { entityType }, replace: true });
      }
    }
  };

  const handleSelectChatType = (type: 'group' | 'channel') => {
    setShowCreateMenu(false);
    if (currentPage !== 'chats') {
      setIsAnimating(true);
      setCurrentPage('chats');
      navigate('/chats', { replace: true });
      setPendingChatType(type);
      setTimeout(() => {
        setIsAnimating(false);
      }, 300);
    } else {
      if (type === 'channel') {
        setChatsFilter('channels');
      } else {
        setChatsFilter('users');
      }
      setActiveChatType(type);
      setTimeout(() => {
        setShowChatForm(true);
      }, 100);
    }
  };

  const handleCreateClick = () => {
    setShowCreateMenu(true);
  };

  const handleProfileClick = () => {
    if (currentPage === 'profile') {
      setIsAnimating(true);
      handleBackNavigation({
        pathname: location.pathname,
        locationState: location.state as { fromLeagueSeasonGameId?: string } | null,
        navigate,
        setCurrentPage,
        nativeCanGoBack: false,
      });
      setTimeout(() => setIsAnimating(false), 300);
      return;
    }
    setIsAnimating(true);
    setCurrentPage('profile');
    navigate('/profile', { replace: true });
    setTimeout(() => setIsAnimating(false), 300);
  };

  return (
    <div className="relative flex flex-shrink-0 items-center gap-4">
      <button
        onClick={handleProfileClick}
        className={`shrink-0 w-8 h-8 rounded-full overflow-hidden ring-2 transition-all flex items-center justify-center shadow-[0_0_20px_rgba(14,165,233,0.7),0_0_35px_rgba(14,165,233,0.4)] dark:shadow-[0_0_20px_rgba(56,189,248,0.7),0_0_35px_rgba(56,189,248,0.4)] ${
          currentPage === 'profile'
            ? 'ring-primary-500/50 dark:ring-primary-400/50'
            : 'ring-transparent hover:ring-primary-500/30 dark:hover:ring-primary-400/30'
        }`}
      >
        {user?.avatar ? (
          <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          <User size={20} className="text-gray-600 dark:text-gray-400" />
        )}
      </button>
      <div ref={buttonContainerRef} className="shrink-0">
        <button
          onClick={handleCreateClick}
          className="shrink-0 w-9 h-9 p-0 rounded-lg bg-primary-600 dark:bg-primary-500 text-white hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors relative z-10 flex items-center justify-center"
          aria-label={t('games.create')}
        >
          <Plus size={20} />
        </button>
      </div>
      
      <CreateMenuModal
        isOpen={showCreateMenu && !pendingChatType && !showChatForm}
        onClose={() => {
          setShowCreateMenu(false);
        }}
        onSelectGameType={handleSelectGameType}
        onSelectChatType={handleSelectChatType}
        buttonRef={buttonContainerRef}
        showChatForm={showChatForm}
        chatFormType={activeChatType}
        onChatFormClose={() => {
          setShowChatForm(false);
          setPendingChatType(null);
          setActiveChatType(null);
        }}
      />
    </div>
  );
};
