import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Trophy } from 'lucide-react';
import { Card } from '@/components';
import type { Game } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { leagueSeasonHubsFromGames } from '@/utils/leagueSeasonHubsFromGames';
import {
  leagueSeasonScheduledGamesFromGames,
  leagueSeasonUnscheduledGamesFromGames,
} from '@/utils/leagueSeasonScheduledGamesFromGames';
import {
  hydrateYourLeaguesHomeExpandedFromIdb,
  persistYourLeaguesHomeExpanded,
  readYourLeaguesHomeExpandedSync,
} from '@/utils/yourLeaguesHomeSectionStorage';
import {
  hydrateYourLeaguesHomeHubExpandedFromIdb,
  persistYourLeaguesHomeHubExpanded,
  readYourLeaguesHomeHubExpandedSync,
  type HubExpandedMap,
} from '@/utils/yourLeaguesHomeHubExpandedStorage';
import { YourLeaguesHomeSeasonOpenRow } from './YourLeaguesHomeSeasonOpenRow';
import { YourLeaguesHomeSeasonScheduledGamesExpandable } from './YourLeaguesHomeSeasonScheduledGamesExpandable';

interface YourLeaguesHomeSectionProps {
  games: Game[];
  gamesUnreadCounts?: Record<string, number>;
  className?: string;
}

export function YourLeaguesHomeSection({
  games,
  gamesUnreadCounts = {},
  className = '',
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
  const [expanded, setExpanded] = useState(readYourLeaguesHomeExpandedSync);
  const [hubExpanded, setHubExpanded] = useState<HubExpandedMap>(
    readYourLeaguesHomeHubExpandedSync
  );

  useEffect(() => {
    let cancel = false;
    void hydrateYourLeaguesHomeExpandedFromIdb().then((v) => {
      if (!cancel) setExpanded(v);
    });
    void hydrateYourLeaguesHomeHubExpandedFromIdb().then((v) => {
      if (!cancel) setHubExpanded(v);
    });
    return () => {
      cancel = true;
    };
  }, []);

  const toggleHubExpanded = useCallback((hubId: string) => {
    setHubExpanded((prev) => {
      const next: HubExpandedMap = { ...prev, [hubId]: !prev[hubId] };
      persistYourLeaguesHomeHubExpanded(next);
      return next;
    });
  }, []);

  if (hubs.length === 0) return null;

  return (
    <Card className={`mb-3 overflow-hidden py-3 ${className}`}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-1 text-left transition-colors hover:bg-gray-100/80 active:bg-gray-100 dark:hover:bg-gray-800/60 dark:active:bg-gray-800 rounded-lg py-1 -my-0.5"
        onClick={() =>
          setExpanded((v) => {
            const next = !v;
            persistYourLeaguesHomeExpanded(next);
            return next;
          })
        }
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
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
        <ChevronDown
          size={20}
          strokeWidth={2}
          className={`shrink-0 text-gray-500 transition-transform duration-300 ease-out motion-reduce:transition-none dark:text-gray-400 ${expanded ? '' : '-rotate-90'}`}
          aria-hidden
        />
      </button>

      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-2.5 px-1 pt-2">
            {hubs.map((hub) => {
              const hubGame = games.find(
                (g) => g.id === hub.hubId && g.entityType === 'LEAGUE_SEASON'
              );
              const scheduledGames = scheduledGamesByHub[hub.hubId] ?? [];
              const unscheduledGames = unscheduledGamesByHub[hub.hubId] ?? [];
              return (
                <div key={hub.hubId} className="flex flex-col gap-1.5">
                  <YourLeaguesHomeSeasonOpenRow
                    hub={hub}
                    hubGame={hubGame}
                    unread={gamesUnreadCounts[hub.hubId] ?? 0}
                  />
                  <YourLeaguesHomeSeasonScheduledGamesExpandable
                    hubGames={scheduledGames}
                    gamesUnreadCounts={gamesUnreadCounts}
                    expanded={!!hubExpanded[hub.hubId]}
                    onToggleExpanded={() => toggleHubExpanded(hub.hubId)}
                    titleKey="home.leagueSeasonScheduledGames"
                  />
                  <YourLeaguesHomeSeasonScheduledGamesExpandable
                    hubGames={unscheduledGames}
                    gamesUnreadCounts={gamesUnreadCounts}
                    expanded={!!hubExpanded[`${hub.hubId}:unscheduled`]}
                    onToggleExpanded={() => toggleHubExpanded(`${hub.hubId}:unscheduled`)}
                    titleKey="home.leagueSeasonUnscheduledGames"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
