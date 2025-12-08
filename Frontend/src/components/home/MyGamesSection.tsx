import { useTranslation } from 'react-i18next';
import { Button, Card, GameCard, Divider } from '@/components';
import { Game } from '@/types';

interface MyGamesSectionProps {
  games: Game[];
  user: any;
  loading: boolean;
  showSkeleton: boolean;
  skeletonStates: Record<number, 'hidden' | 'fading-in' | 'visible' | 'fading-out'>;
  showChatFilter: boolean;
  gamesUnreadCounts: Record<string, number>;
  onShowAllGames: () => void;
}

export const MyGamesSection = ({
  games,
  user,
  loading,
  showSkeleton,
  skeletonStates,
  showChatFilter,
  gamesUnreadCounts,
  onShowAllGames,
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
            {showChatFilter ? t('chat.noUnreadMessages') : t('home.noGames')}
          </p>
          {showChatFilter && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onShowAllGames}
            >
              {t('chat.showAllGames')}
            </Button>
          )}
        </Card>
      </div>
    );
  }

  if (showChatFilter && games.filter(game => (gamesUnreadCounts[game.id] || 0) > 0).length === 0) {
    return (
      <div>
        <Card className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {t('chat.noUnreadMessages')}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={onShowAllGames}
          >
            {t('chat.showAllGames')}
          </Button>
        </Card>
      </div>
    );
  }

  const filteredGames = games.filter((game) => {
    if (!showChatFilter) return true;
    return (gamesUnreadCounts[game.id] || 0) > 0;
  });

  const displayGames = filteredGames;

  if (displayGames.length === 0) {
    return (
      <div>
        <Card className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {showChatFilter ? t('chat.noUnreadMessages') : t('home.noGames')}
          </p>
          {showChatFilter && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onShowAllGames}
            >
              {t('chat.showAllGames')}
            </Button>
          )}
        </Card>
      </div>
    );
  }

  const announcedOrStartedGames = displayGames.filter(
    (game) => game.status === 'ANNOUNCED' || game.status === 'STARTED'
  );
  const finishedOrArchivedGames = displayGames.filter(
    (game) => game.status === 'FINISHED' || game.status === 'ARCHIVED'
  );

  const renderGame = (game: Game, globalIndex: number) => (
    <div
      key={game.id}
      className={`transition-all duration-500 ease-in-out ${
        showChatFilter 
          ? 'animate-in slide-in-from-top-4 fade-in' 
          : 'animate-in slide-in-from-top-4'
      }`}
      style={{
        animationDelay: showChatFilter ? `${globalIndex * 100}ms` : '0ms'
      }}
    >
      <GameCard
        game={game}
        user={user}
        isInitiallyCollapsed={globalIndex !== 0}
        unreadCount={gamesUnreadCounts[game.id] || 0}
        forceCollapsed={showChatFilter ? true : undefined}
      />
    </div>
  );

  return (
    <div>
      <div>
        <div className="space-y-4">
          {announcedOrStartedGames.map((game, index) => 
            renderGame(game, index)
          )}
          
          {announcedOrStartedGames.length > 0 && finishedOrArchivedGames.length > 0 && (
            <div>
              <Divider className="-mt-4" />
              <div className="flex justify-center -mt-9">
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center px-3 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800">
                  {t('home.finishedToday', { defaultValue: 'Finished today' })}
                </p>
              </div>
            </div>
          )}
          
          {finishedOrArchivedGames.map((game, index) => 
            renderGame(game, announcedOrStartedGames.length + index)
          )}
        </div>
      </div>
    </div>
  );
};

