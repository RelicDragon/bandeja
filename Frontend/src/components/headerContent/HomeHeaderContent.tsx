import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button, GameTypeDropdown } from '@/components';
import { useHeaderStore } from '@/store/headerStore';
import { EntityType } from '@/types';
import { useNavigate } from 'react-router-dom';

export const HomeHeaderContent = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showGameTypeModal, setShowGameTypeModal } = useHeaderStore();

  const handleSelectEntityType = (entityType: EntityType) => {
    setShowGameTypeModal(false);
    navigate('/create-game', { state: { entityType } });
  };

  return (
    <div className="relative">
      <Button
        onClick={() => setShowGameTypeModal(true)}
        variant="primary"
        size="sm"
        className="flex items-center gap-2 relative z-50"
      >
        <Plus size={16} />
        {t('games.create')}
      </Button>
      
      <GameTypeDropdown
        isOpen={showGameTypeModal}
        onClose={() => setShowGameTypeModal(false)}
        onSelectType={handleSelectEntityType}
      />
    </div>
  );
};
