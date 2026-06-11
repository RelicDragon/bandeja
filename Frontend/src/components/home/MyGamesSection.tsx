import { useTranslation } from 'react-i18next';
import { Check, Search, CalendarX2 } from 'lucide-react';
import { Button, GameCard, Divider } from '@/components';
import { UpcomingGamesList } from '@/components/home/UpcomingGamesList';
import { AnimatedGameList } from '@/components/home/AnimatedGameList';
import { EmptyStateCard } from '@/components/home/EmptyStateCard';
import { GameCardSkeleton } from '@/components/home/GameCardSkeleton';
import { Game } from '@/types';

interface MyGamesSectionProps {
  games: Game[];
  user: any;
  loading: boolean;
  showSkeleton: boolean;
  skeletonStates: Record<number, 'hidden' | 'fading-in' | 'visible' | 'fading-out'>;
  gamesUnreadCounts: Record<string, number>;
  onSwitchToSearch?: () => void;
  onNoteSaved?: (gameId: string) => void;
  upcomingGames?: Game[];
}

export const MyGamesSection = ({
  games,
  user,
  loading,
  showSkeleton,
  skeletonStates,
  gamesUnreadCounts,
  onSwitchToSearch,
  onNoteSaved,
  upcomingGames,
}: MyGamesSectionProps) => {
  const { t } = useTranslation();

  if (loading && showSkeleton) {
    return (
      <div>
        <div className="space-y-4 pb-8">
          {[0, 1, 2].map((skeletonIndex) => {
            const state = skeletonStates[skeletonIndex];
            if (state === 'hidden') return null;

            return (
              <div
                key={skeletonIndex}
                className={`transition-all duration-300 ${
                  state === 'visible'
                    ? 'opacity-100 transform translate-y-0'
                    : state === 'fading-out'
                      ? 'opacity-0 transform -translate-y-2'
                      : 'opacity-0 transform translate-y-2'
                }`}
              >
                <GameCardSkeleton />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const displayGames = games.filter(
    (game) => game.entityType !== 'LEAGUE_SEASON' && game.status !== 'ARCHIVED'
  );

  if (displayGames.length === 0) {
    if (upcomingGames && upcomingGames.length > 0) {
      return (
        <div className="pb-8">
          <UpcomingGamesList
            games={upcomingGames}
            user={user}
            gamesUnreadCounts={gamesUnreadCounts}
            onNoteSaved={onNoteSaved}
          />
        </div>
      );
    }
    if (games.length === 0) {
      return (
        <div className="pb-8">
          <EmptyStateCard
            icon={CalendarX2}
            title={t('home.noGames')}
            action={
              onSwitchToSearch && (
                <Button
                  variant="primary"
                  size="md"
                  onClick={onSwitchToSearch}
                  className="inline-flex items-center gap-2"
                >
                  <Search className="w-5 h-5" />
                  {t('home.findGames', { defaultValue: 'Find games' })}
                </Button>
              )
            }
          />
        </div>
      );
    }
    return <div className="pb-2" />;
  }

  const announcedOrStartedGames = displayGames
    .filter((game) => game.status === 'ANNOUNCED' || game.status === 'STARTED')
    .sort((a, b) => {
      if (a.timeIsSet === false && b.timeIsSet !== false) return 1;
      if (a.timeIsSet !== false && b.timeIsSet === false) return -1;
      return 0;
    });
  const finishedGames = displayGames
    .filter((game) => game.status === 'FINISHED')
    .sort((a, b) => {
      if (a.timeIsSet === false && b.timeIsSet !== false) return 1;
      if (a.timeIsSet !== false && b.timeIsSet === false) return -1;
      return 0;
    });

  const renderGame = (game: Game) => (
    <GameCard
      game={game}
      user={user}
      unreadCount={gamesUnreadCounts[game.id] || 0}
      onNoteSaved={onNoteSaved}
    />
  );

  return (
    <div className="space-y-4 pb-8">
      <AnimatedGameList
        items={announcedOrStartedGames}
        getKey={(game) => game.id}
        renderItem={renderGame}
        className="space-y-4"
      />

      {announcedOrStartedGames.length > 0 && finishedGames.length > 0 && (
        <div>
          <Divider />
          <div className="flex justify-center -mt-9">
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center px-3 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 flex items-center gap-1.5">
              <Check className="w-3 h-3" />
              {t('home.finishedToday', { defaultValue: 'Finished' })}
            </p>
          </div>
        </div>
      )}

      <AnimatedGameList
        items={finishedGames}
        getKey={(game) => game.id}
        renderItem={renderGame}
        className="space-y-4"
      />
    </div>
  );
};
