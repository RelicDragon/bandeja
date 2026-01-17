import { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components';
import { CreateMenuModal } from '@/components/CreateMenuModal';
import { useHeaderStore } from '@/store/headerStore';
import { useNavigationStore } from '@/store/navigationStore';
import { EntityType } from '@/types';
import { useNavigate } from 'react-router-dom';

export const HomeHeaderContent = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedDateForCreateGame } = useHeaderStore();
  const { currentPage, setCurrentPage, setIsAnimating, setChatsFilter } = useNavigationStore();
  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const [isIconOnly, setIsIconOnly] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [pendingChatType, setPendingChatType] = useState<'group' | 'channel' | null>(null);
  const [showChatForm, setShowChatForm] = useState(false);
  const [activeChatType, setActiveChatType] = useState<'group' | 'channel' | null>(null);

  const shouldUseIconOnly = currentPage === 'profile' || currentPage === 'leaderboard' || currentPage === 'chats';

  useEffect(() => {
    if (!shouldUseIconOnly) {
      setIsIconOnly(false);
      return;
    }

    const checkWidth = () => {
      setIsIconOnly(window.innerWidth < 450);
    };

    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, [shouldUseIconOnly]);

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
          navigate('/create-league');
        } else {
          navigate('/create-game', { state: { entityType, initialDate: selectedDateForCreateGame } });
        }
      }, 300);
    } else {
      if (entityType === 'LEAGUE') {
        navigate('/create-league');
      } else {
        navigate('/create-game', { state: { entityType, initialDate: selectedDateForCreateGame } });
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

  return (
    <div className="relative">
      <div ref={buttonContainerRef}>
        {isIconOnly ? (
          <button
            onClick={handleCreateClick}
            className="p-2 rounded-lg bg-primary-600 dark:bg-primary-500 text-white hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors relative z-10 flex items-center justify-center"
          >
            <Plus size={20} />
          </button>
        ) : (
          <Button
            onClick={handleCreateClick}
            variant="primary"
            size="sm"
            className="flex items-center gap-2 relative z-10"
          >
            <Plus size={16} />
            {t('games.create')}
          </Button>
        )}
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
