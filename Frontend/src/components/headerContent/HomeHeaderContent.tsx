import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button, GameTypeModal } from '@/components';
import { useHeaderStore } from '@/store/headerStore';
import { EntityType } from '@/types';
import { useNavigate } from 'react-router-dom';

export const HomeHeaderContent = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showGameTypeModal, setShowGameTypeModal, selectedDateForCreateGame } = useHeaderStore();
  const buttonContainerRef = useRef<HTMLDivElement>(null);

  const handleSelectEntityType = (entityType: EntityType) => {
    console.log('HomeHeaderContent - navigating with date:', selectedDateForCreateGame);
    setShowGameTypeModal(false);
    navigate('/create-game', { state: { entityType, initialDate: selectedDateForCreateGame } });
  };

  return (
    <div className="relative">
      <div ref={buttonContainerRef}>
        <Button
          onClick={() => setShowGameTypeModal(true)}
          variant="primary"
          size="sm"
          className="flex items-center gap-2 relative z-10"
        >
          <Plus size={16} />
          {t('games.create')}
        </Button>
      </div>
      
      <GameTypeModal
        isOpen={showGameTypeModal}
        onClose={() => setShowGameTypeModal(false)}
        onSelectType={handleSelectEntityType}
        buttonRef={buttonContainerRef}
      />
    </div>
  );
};
