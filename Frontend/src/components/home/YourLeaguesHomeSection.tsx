import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';
import type { Game } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { leagueSeasonHubsFromGames } from '@/utils/leagueSeasonHubsFromGames';
import {
  leagueSeasonScheduledGamesFromGames,
  leagueSeasonUnscheduledGamesFromGames,
} from '@/utils/leagueSeasonScheduledGamesFromGames';
import {
  buildLeagueHomeHubBracketPath,
  hubHasBracketLeagueGames,
} from '@/utils/leagueHomeBracket.util';
import { YourLeaguesHomeSeasonOpenRow } from './YourLeaguesHomeSeasonOpenRow';
import { YourLeaguesHomeSeasonScheduledGamesExpandable } from './YourLeaguesHomeSeasonScheduledGamesExpandable';

interface YourLeaguesHomeSectionProps {
  games: Game[];
  gamesUnreadCounts?: Record<string, number>;
  className?: string;
  embedded?: boolean;
}

export function YourLeaguesHomeSection({
  games,
  gamesUnreadCounts = {},
  className = '',
  embedded = false,
}: YourLeaguesHomeSectionProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const hubs = useMemo(() => leagueSeasonHubsFromGames(games), [games]);
  const scheduledGamesByHub = useMemo(
    () => leagueSeasonScheduledGamesFromGames(games, user?.id),
    [games, user?.id]
  );
  const unscheduledGamesByHub = useMemo(
    () => leagueSeasonUnscheduledGamesFromGames(games, user?.id),
    [games, user?.id]
  );

  if (hubs.length === 0) {
    if (embedded) {
      return (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('home.noLeagues', { defaultValue: 'No leagues yet' })}
        </p>
      );
    }
    return null;
  }

  return (
    <section className={className}>
      {!embedded && (
        <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
          <Trophy
            size={18}
            strokeWidth={2}
            className="shrink-0 text-gray-500 dark:text-gray-400"
            fill="none"
            aria-hidden
          />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {t('home.yourLeagues', { defaultValue: 'Leagues' })}
          </p>
          <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gray-900/5 px-1.5 text-[10px] font-semibold tabular-nums text-gray-600 dark:bg-white/10 dark:text-gray-300">
            {hubs.length}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {hubs.map((hub) => {
          const hubGame = games.find(
            (g) => g.id === hub.hubId && g.entityType === 'LEAGUE_SEASON'
          );
          const scheduledGames = scheduledGamesByHub[hub.hubId] ?? [];
          const unscheduledGames = unscheduledGamesByHub[hub.hubId] ?? [];
          const hubShellClass = hub.stalePastSchedule
            ? 'overflow-hidden rounded-xl border border-amber-500/80 bg-amber-50/90 shadow-md shadow-amber-500/10 dark:border-amber-600/60 dark:bg-amber-950/30 dark:shadow-amber-900/20'
            : 'overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900';

          return (
            <div key={hub.hubId} className={hubShellClass}>
              <YourLeaguesHomeSeasonOpenRow
                hub={hub}
                hubGame={hubGame}
                unread={gamesUnreadCounts[hub.hubId] ?? 0}
                hasBracketPlayoff={hubHasBracketLeagueGames(games, hub.hubId)}
                bracketShortcutPath={buildLeagueHomeHubBracketPath(games, hub.hubId)}
              />
              <div className="flex flex-col gap-2 p-2">
                <YourLeaguesHomeSeasonScheduledGamesExpandable
                  hubGames={scheduledGames}
                  gamesUnreadCounts={gamesUnreadCounts}
                  titleKey="home.leagueSeasonScheduledGames"
                />
                <YourLeaguesHomeSeasonScheduledGamesExpandable
                  hubGames={unscheduledGames}
                  gamesUnreadCounts={gamesUnreadCounts}
                  titleKey="home.leagueSeasonUnscheduledGames"
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
