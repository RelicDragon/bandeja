import { MessageCircle, TableProperties } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Button } from '@/components';
import { useNavigateWithTracking } from '@/hooks/useNavigateWithTracking';
import { useNavigationStore } from '@/store/navigationStore';

interface GameDetailsHeaderContentProps {
  canAccessChat: boolean;
}

export const GameDetailsHeaderContent = ({ canAccessChat }: GameDetailsHeaderContentProps) => {
  const { t } = useTranslation();
  const navigate = useNavigateWithTracking();
  const { id } = useParams<{ id: string }>();
  const { gameDetailsCanShowTableView, gameDetailsShowTableView, setGameDetailsShowTableView } = useNavigationStore();

  const handleChatClick = () => {
    if (id) {
      navigate(`/games/${id}/chat`);
    }
  };

  return (
    <>
      {gameDetailsCanShowTableView && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <button
            onClick={() => setGameDetailsShowTableView(!gameDetailsShowTableView)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              gameDetailsShowTableView
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            <TableProperties size={18} />
            {t('gameResults.tableView', { defaultValue: 'Table View' })}
          </button>
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
