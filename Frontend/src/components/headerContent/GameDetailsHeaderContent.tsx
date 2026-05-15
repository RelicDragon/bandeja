import { MessageCircle, TableProperties } from 'lucide-react';
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
  const {
    gameDetailsCanShowTableView,
    gameDetailsTableViewOverride,
    setGameDetailsTableViewOverride,
  } = useNavigationStore();
  const effectiveTableView = gameDetailsTableViewOverride ?? isLandscape;

  const handleChatClick = () => {
    if (id) {
      navigate(`/games/${id}/chat`);
    }
  };

  return (
    <>
      {gameDetailsCanShowTableView && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10 flex max-w-[min(100vw-8rem,20rem)] flex-wrap items-center justify-center gap-2 px-1 h-16 sm:max-w-none"
          style={{ top: 'env(safe-area-inset-top)' }}
        >
          <Button
            onClick={() => setGameDetailsTableViewOverride(!effectiveTableView)}
            variant={effectiveTableView ? 'primary' : 'secondary'}
            size="sm"
            className="flex items-center gap-2"
          >
            <TableProperties size={18} />
            <span className="hidden sm:inline">{t('gameResults.tableView')}</span>
          </Button>
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
