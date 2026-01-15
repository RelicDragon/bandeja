import { useState, useEffect } from 'react';
import { Card } from '@/components';
import { Game, Bet } from '@/types';
import { betsApi } from '@/api/bets';
import { BetCard } from './BetCard';
import { CreateBetModal } from './CreateBetModal';
import { Coins, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { socketService } from '@/services/socketService';

interface BetSectionProps {
  game: Game;
  onGameUpdate?: (game: Game) => void;
}

export const BetSection = ({ game }: BetSectionProps) => {
  const { t } = useTranslation();
  const [bets, setBets] = useState<Bet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const canEdit = game.resultsStatus !== 'FINAL';

  useEffect(() => {
    const loadBets = async () => {
      if (!game.id) return;
      try {
        const response = await betsApi.getGameBets(game.id);
        setBets(response.data);
      } catch (error) {
        console.error('Failed to load bets:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadBets();
  }, [game.id]);

  useEffect(() => {
    if (!game.id) return;

    const handleBetCreated = (data: { gameId: string; bet: Bet }) => {
      if (data.gameId === game.id) {
        setBets(prev => [data.bet, ...prev]);
      }
    };

    const handleBetUpdated = (data: { gameId: string; bet: Bet }) => {
      if (data.gameId === game.id) {
        setBets(prev => prev.map(b => b.id === data.bet.id ? data.bet : b));
      }
    };

    const handleBetDeleted = (data: { gameId: string; betId: string }) => {
      if (data.gameId === game.id) {
        setBets(prev => prev.filter(b => b.id !== data.betId));
      }
    };

    const handleBetResolved = (data: { gameId: string; betId: string; winnerId: string; loserId: string }) => {
      if (data.gameId === game.id) {
        // Reload bets to get updated status
        betsApi.getGameBets(game.id).then(response => {
          setBets(response.data);
        }).catch(console.error);
      }
    };

    socketService.on('bet:created', handleBetCreated);
    socketService.on('bet:updated', handleBetUpdated);
    socketService.on('bet:deleted', handleBetDeleted);
    socketService.on('bet:resolved', handleBetResolved);

    return () => {
      socketService.off('bet:created', handleBetCreated);
      socketService.off('bet:updated', handleBetUpdated);
      socketService.off('bet:deleted', handleBetDeleted);
      socketService.off('bet:resolved', handleBetResolved);
    };
  }, [game.id]);

  if (isLoading) {
    return null;
  }

  return (
    <>
      <Card>
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Coins size={20} className="text-primary-600" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {t('bets.title', { defaultValue: 'Bets' })}
              </h2>
            </div>
            {canEdit && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300 ease-in-out shadow-sm hover:shadow-md bg-primary-600 hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-700 border border-primary-600 dark:border-primary-600 shadow-primary-100 dark:shadow-primary-900/20"
                title={t('bets.createBet', { defaultValue: 'Create Bet' })}
              >
                <Plus size={18} className="text-white" />
                <span className="text-white text-sm font-medium">{t('common.create', { defaultValue: 'Create' })}</span>
              </button>
            )}
          </div>

          {bets.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {t('bets.noBets', { defaultValue: 'No bets yet. Be the first to create one!' })}
            </div>
          ) : (
            <div className="space-y-3">
              {bets.map(bet => (
                <BetCard 
                  key={bet.id} 
                  bet={bet} 
                  game={game} 
                  onBetUpdate={(updatedBet) => {
                    setBets(prev => prev.map(b => b.id === updatedBet.id ? updatedBet : b));
                  }} 
                />
              ))}
            </div>
          )}
        </div>
      </Card>

      {showCreateModal && (
        <CreateBetModal
          isOpen={showCreateModal}
          game={game}
          onClose={() => setShowCreateModal(false)}
          onBetCreated={(bet) => {
            setBets(prev => [bet, ...prev]);
            setShowCreateModal(false);
          }}
        />
      )}
    </>
  );
};
