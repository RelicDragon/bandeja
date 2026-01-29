import { useState, useEffect } from 'react';
import { Card } from '@/components';
import { Game, Bet } from '@/types';
import { betsApi } from '@/api/bets';
import { BetCard } from './BetCard';
import { CreateBetModal } from './CreateBetModal';
import { Coins, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSocketEventsStore } from '@/store/socketEventsStore';

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

  const lastBetCreated = useSocketEventsStore((state) => state.lastBetCreated);
  const lastBetUpdated = useSocketEventsStore((state) => state.lastBetUpdated);
  const lastBetDeleted = useSocketEventsStore((state) => state.lastBetDeleted);
  const lastBetResolved = useSocketEventsStore((state) => state.lastBetResolved);

  useEffect(() => {
    if (!lastBetCreated || lastBetCreated.gameId !== game.id) return;
    setBets(prev => [lastBetCreated.bet, ...prev]);
  }, [lastBetCreated, game.id]);

  useEffect(() => {
    if (!lastBetUpdated || lastBetUpdated.gameId !== game.id) return;
    setBets(prev => prev.map(b => b.id === lastBetUpdated.bet.id ? lastBetUpdated.bet : b));
  }, [lastBetUpdated, game.id]);

  useEffect(() => {
    if (!lastBetDeleted || lastBetDeleted.gameId !== game.id) return;
    setBets(prev => prev.filter(b => b.id !== lastBetDeleted.betId));
  }, [lastBetDeleted, game.id]);

  useEffect(() => {
    if (!lastBetResolved || lastBetResolved.gameId !== game.id) return;
    betsApi.getGameBets(game.id).then(response => {
      setBets(response.data);
    }).catch(console.error);
  }, [lastBetResolved, game.id]);

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
                title={t('bets.createBet', { defaultValue: 'Create Challenge' })}
              >
                <Plus size={18} className="text-white" />
                <span className="text-white text-sm font-medium">{t('common.create', { defaultValue: 'Create' })}</span>
              </button>
            )}
          </div>

          {bets.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {t('bets.noBets', { defaultValue: 'No challenges yet. Be the first to create one!' })}
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
