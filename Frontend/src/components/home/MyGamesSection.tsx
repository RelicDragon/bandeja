import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Search, CalendarX2 } from 'lucide-react';
import { Button, GameCard, Divider } from '@/components';
import { UpcomingGamesList } from '@/components/home/UpcomingGamesList';
import { AnimatedGameList } from '@/components/home/AnimatedGameList';
import { EmptyStateCard } from '@/components/home/EmptyStateCard';
import { GamesLoadingSkeleton } from '@/components/home/GameCardSkeleton';
import { AnimatedLoadingSwap } from '@/components/motion/AnimatedLoadingSwap';
import { Game } from '@/types';

interface MyGamesSectionProps {
  games: Game[];
  user: any;
  loading: boolean;
  gamesUnreadCounts: Record<string, number>;
  onSwitchToSearch?: () => void;
  onNoteSaved?: (gameId: string) => void;
  upcomingGames?: Game[];
}

const getGameId = (game: Game) => game.id;

const MyGamesSectionView = ({
  games,
  user,
  loading,
  gamesUnreadCounts,
  onSwitchToSearch,
  onNoteSaved,
  upcomingGames,
}: MyGamesSectionProps) => {
  const { t } = useTranslation();

  const displayGames = useMemo(
    () => games.filter((game) => game.entityType !== 'LEAGUE_SEASON'),
    [games],
  );

  const renderGame = useCallback(
    (game: Game) => (
      <GameCard
        game={game}
        user={user}
        unreadCount={gamesUnreadCounts[game.id] || 0}
        onNoteSaved={onNoteSaved}
      />
    ),
    [user, gamesUnreadCounts, onNoteSaved],
  );

  // Announced/started above, finished below; both sorted with undated last.
  const { announcedOrStartedGames, finishedGames } = useMemo(() => {
    const byStartTime = (direction: 1 | -1) => (a: Game, b: Game) => {
      if (a.timeIsSet === false && b.timeIsSet !== false) return 1;
      if (a.timeIsSet !== false && b.timeIsSet === false) return -1;
      const delta = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      return direction === 1 ? delta : -delta;
    };
    return {
      announcedOrStartedGames: displayGames
        .filter((game) => game.status === 'ANNOUNCED' || game.status === 'STARTED')
        .sort(byStartTime(1)),
      finishedGames: displayGames
        .filter((game) => game.status === 'FINISHED' || game.status === 'ARCHIVED')
        .sort(byStartTime(-1)),
    };
  }, [displayGames]);

  const content = (() => {
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

    return (
      <div className="space-y-4 pb-8">
        <AnimatedGameList
          items={announcedOrStartedGames}
          getKey={getGameId}
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
          getKey={getGameId}
          renderItem={renderGame}
          className="space-y-4"
        />
      </div>
    );
  })();

  return (
    <AnimatedLoadingSwap isLoading={loading} loading={<GamesLoadingSkeleton />}>
      {content}
    </AnimatedLoadingSwap>
  );
};

export const MyGamesSection = memo(MyGamesSectionView);
