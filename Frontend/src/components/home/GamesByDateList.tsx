import { useMemo, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { GameCard } from '@/components';
import { AnimatedGameList } from '@/components/home/AnimatedGameList';
import { AnimatedMount } from '@/components/motion/AnimatedMount';
import { GamesDateGroupHeading } from '@/components/home/GamesDateGroupHeading';
import type { Game } from '@/types';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { groupGamesByDate } from '@/utils/groupGamesByDate';
import type { FindSportFilterValue } from '@/utils/gameFiltersStorage';

interface GamesByDateListProps {
  games: Game[];
  user?: unknown;
  onJoin?: (gameId: string, e: MouseEvent) => void;
  onNoteSaved?: (gameId: string) => void;
  findFilterSport?: FindSportFilterValue;
}

export function GamesByDateList({
  games,
  user,
  onJoin,
  onNoteSaved,
  findFilterSport,
}: GamesByDateListProps) {
  const { t } = useTranslation();
  const displaySettings = useMemo(
    () => resolveDisplaySettings(user ?? null),
    [user],
  );
  const grouped = useMemo(
    () => groupGamesByDate(games, displaySettings, t),
    [games, displaySettings, t],
  );

  if (grouped.length === 0) {
    return null;
  }

  return (
    <AnimatedMount className="space-y-4 pb-8">
      {grouped.map((group) => (
        <div key={group.dateStr}>
          <GamesDateGroupHeading label={group.label} />
          <AnimatedGameList
            items={group.games}
            getKey={(game) => game.id}
            renderItem={(game) => (
              <GameCard
                game={game}
                user={user}
                showJoinButton={Boolean(onJoin)}
                onJoin={onJoin}
                onNoteSaved={onNoteSaved}
                findFilterSport={findFilterSport}
              />
            )}
            className="space-y-4"
          />
        </div>
      ))}
    </AnimatedMount>
  );
}
