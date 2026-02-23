import { MessageCircle, Plus, TableProperties } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Button } from '@/components';
import { useIsLandscape } from '@/hooks/useIsLandscape';
import { useNavigateWithTracking } from '@/hooks/useNavigateWithTracking';
import { useNavigationStore } from '@/store/navigationStore';

interface GameDetailsHeaderContentProps {
  canAccessChat: boolean;
}

export const GameDetailsHeaderContent = ({ canAccessChat }: GameDetailsHeaderContentProps) => {
  const { t } = useTranslation();
  const navigate = useNavigateWithTracking();
  const { id } = useParams<{ id: string }>();
  const isLandscape = useIsLandscape();
  const { gameDetailsCanShowTableView, gameDetailsShowTableView, setGameDetailsShowTableView, gameDetailsTableAddRoundCallback, gameDetailsTableIsEditing } = useNavigationStore();

  const handleChatClick = () => {
    if (id) {
      navigate(`/games/${id}/chat`);
    }
  };

  return (
    <>
      {gameDetailsCanShowTableView && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 h-16"
          style={{ top: 'env(safe-area-inset-top)' }}
        >
          <Button
            onClick={() => setGameDetailsShowTableView(!gameDetailsShowTableView)}
            variant={gameDetailsShowTableView ? 'primary' : 'secondary'}
            size="sm"
            className="flex items-center gap-2"
          >
            <TableProperties size={18} />
            {t('gameResults.tableView')}
          </Button>
          {isLandscape && gameDetailsShowTableView && gameDetailsTableIsEditing && gameDetailsTableAddRoundCallback && (
            <Button onClick={gameDetailsTableAddRoundCallback} variant="primary" size="sm" className="flex items-center gap-2">
              <Plus size={16} />
              {t('gameResults.addRound')}
            </Button>
          )}
        </div>
      )}
      {canAccessChat && (
        <Button
          onClick={handleChatClick}
          variant="primary"
          size="sm"
          className="flex items-center gap-2"
        >
          <MessageCircle size={16} />
          {t('nav.chat')}
        </Button>
      )}
    </>
  );
};
