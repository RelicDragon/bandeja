import { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button, GameTypeModal } from '@/components';
import { CreateGroupChannelModal } from '@/components/chat/CreateGroupChannelModal';
import { useHeaderStore } from '@/store/headerStore';
import { useNavigationStore } from '@/store/navigationStore';
import { EntityType } from '@/types';
import { useNavigate } from 'react-router-dom';

export const HomeHeaderContent = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showGameTypeModal, setShowGameTypeModal, selectedDateForCreateGame } = useHeaderStore();
  const { currentPage } = useNavigationStore();
  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const [isIconOnly, setIsIconOnly] = useState(false);
  const [showGroupChannelModal, setShowGroupChannelModal] = useState(false);

  const isChatsPage = currentPage === 'chats';
  const shouldUseIconOnly = currentPage === 'profile' || currentPage === 'leaderboard';

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

  const handleSelectEntityType = (entityType: EntityType) => {
    console.log('HomeHeaderContent - navigating with date:', selectedDateForCreateGame);
    setShowGameTypeModal(false);
    navigate('/create-game', { state: { entityType, initialDate: selectedDateForCreateGame } });
  };

  const handleCreateClick = () => {
    if (isChatsPage) {
      setShowGroupChannelModal(true);
    } else {
      setShowGameTypeModal(true);
    }
  };

  const handleGroupChannelCreated = () => {
    window.dispatchEvent(new CustomEvent('refresh-chat-list'));
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
            {isChatsPage ? t('chat.create', { defaultValue: 'Create' }) : t('games.create')}
          </Button>
        )}
      </div>
      
      {isChatsPage ? (
        <CreateGroupChannelModal
          isOpen={showGroupChannelModal}
          onClose={() => setShowGroupChannelModal(false)}
          buttonRef={buttonContainerRef}
          onCreated={handleGroupChannelCreated}
        />
      ) : (
        <GameTypeModal
          isOpen={showGameTypeModal}
          onClose={() => setShowGameTypeModal(false)}
          onSelectType={handleSelectEntityType}
          buttonRef={buttonContainerRef}
        />
      )}
    </div>
  );
};
