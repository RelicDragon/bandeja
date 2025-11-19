import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Card, Button } from '@/components';
import { GameCard } from '@/components/GameCard';
import { leaguesApi, LeagueRound } from '@/api/leagues';
import { useAuthStore } from '@/store/authStore';
import { Loader2, Plus } from 'lucide-react';

interface LeagueScheduleTabProps {
  leagueSeasonId: string;
  canEdit?: boolean;
}

export const LeagueScheduleTab = ({ leagueSeasonId, canEdit = false }: LeagueScheduleTabProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [rounds, setRounds] = useState<LeagueRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const fetchRounds = async () => {
    try {
      const response = await leaguesApi.getRounds(leagueSeasonId);
      setRounds(response.data);
    } catch (error) {
      console.error('Failed to fetch league rounds:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRounds();
  }, [leagueSeasonId]);

  const handleCreateRound = async () => {
    if (isCreating) return;
    
    setIsCreating(true);
    try {
      await leaguesApi.createRound(leagueSeasonId);
      toast.success(t('gameDetails.roundCreated'));
      await fetchRounds();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setIsCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin h-8 w-8 text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {canEdit && (
        <Card>
          <Button
            onClick={handleCreateRound}
            disabled={isCreating}
            className="w-full"
          >
            <Plus size={18} className="mr-2" />
            {isCreating ? t('common.loading') : t('gameDetails.createRound')}
          </Button>
        </Card>
      )}
      {rounds.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            {t('gameDetails.noRounds')}
          </div>
        </Card>
      ) : (
        rounds.map((round) => (
        <div key={round.id} className="space-y-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('gameDetails.round')} {round.orderIndex + 1}
          </h3>
          {round.games.length === 0 ? (
            <Card>
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                {t('gameDetails.noGamesInRound')}
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {round.games.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  user={user}
                  isInitiallyCollapsed={true}
                />
              ))}
            </div>
          )}
        </div>
        ))
      )}
    </div>
  );
};

