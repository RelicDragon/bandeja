import { useTranslation } from 'react-i18next';
import { Check, Search } from 'lucide-react';
import { Button, Card, GameCard, Divider } from '@/components';
import { Game } from '@/types';

interface MyGamesSectionProps {
  games: Game[];
  user: any;
  loading: boolean;
  showSkeleton: boolean;
  skeletonStates: Record<number, 'hidden' | 'fading-in' | 'visible' | 'fading-out'>;
  gamesUnreadCounts: Record<string, number>;
  onSwitchToSearch?: () => void;
}

export const MyGamesSection = ({
  games,
  user,
  loading,
  showSkeleton,
  skeletonStates,
  gamesUnreadCounts,
  onSwitchToSearch,
}: MyGamesSectionProps) => {
  const { t } = useTranslation();

  if (loading && showSkeleton) {
    return (
      <div>
        <div className="space-y-4">
          {[0, 1, 2].map((skeletonIndex) => {
            const state = skeletonStates[skeletonIndex];
            if (state === 'hidden') return null;
            
            return (
              <Card 
                key={skeletonIndex} 
                className={`animate-pulse transition-all duration-300 ${
                  state === 'fading-in' ? 'opacity-0 transform translate-y-2' : 
                  state === 'visible' ? 'opacity-100 transform translate-y-0' : 
                  state === 'fading-out' ? 'opacity-0 transform -translate-y-2' : 'opacity-0 transform translate-y-2'
                }`}
              >
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded mb-3 w-1/3"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2 w-1/2"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2 w-2/3"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div>
        <Card className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {t('home.noGames')}
          </p>
        </Card>
      </div>
    );
  }

  const displayGames = games;

  const announcedOrStartedGames = displayGames
    .filter((game) => game.status === 'ANNOUNCED' || game.status === 'STARTED')
    .sort((a, b) => {
      if (a.timeIsSet === false && b.timeIsSet !== false) return 1;
      if (a.timeIsSet !== false && b.timeIsSet === false) return -1;
      return 0;
    });
  const finishedOrArchivedGames = displayGames
    .filter((game) => game.status === 'FINISHED' || game.status === 'ARCHIVED')
    .sort((a, b) => {
      if (a.timeIsSet === false && b.timeIsSet !== false) return 1;
      if (a.timeIsSet !== false && b.timeIsSet === false) return -1;
      return 0;
    });

  const renderGame = (game: Game) => (
    <div
      key={game.id}
      className="transition-all duration-500 ease-in-out animate-in slide-in-from-top-4"
    >
      <GameCard
        game={game}
        user={user}
        isInitiallyCollapsed={game.entityType === 'LEAGUE_SEASON' ? true : false}
        unreadCount={gamesUnreadCounts[game.id] || 0}
      />
    </div>
  );

  return (
    <div>
      <div>
        <div className="space-y-4">
          {announcedOrStartedGames.map((game) => 
            renderGame(game)
          )}
          
          {announcedOrStartedGames.length > 0 && finishedOrArchivedGames.length > 0 && (
            <div>
              <Divider className="-mt-4" />
              <div className="flex justify-center -mt-9">
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center px-3 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 flex items-center gap-1.5">
                  <Check className="w-3 h-3" />
                  {t('home.finishedToday', { defaultValue: 'Finished today' })}
                </p>
              </div>
            </div>
          )}
          
          {finishedOrArchivedGames.map((game) => 
            renderGame(game)
          )}
        </div>
      </div>
      {onSwitchToSearch && (
        <div className="mt-6 flex justify-center">
          <Button
            variant="primary"
            size="sm"
            onClick={onSwitchToSearch}
            className="flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            {t('home.findGameHint', { defaultValue: 'Want to find a game? Press Search tab' })}
          </Button>
        </div>
      )}
    </div>
  );
};

