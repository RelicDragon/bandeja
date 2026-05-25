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
  const [hubUiExpanded, setHubUiExpanded] = useState<HubExpandedMap>(
    readYourLeaguesHomeHubExpandedSync
  );
  const [unscheduledExpanded, setUnscheduledExpanded] = useState<HubExpandedMap>({});

  useEffect(() => {
    let cancel = false;
    void hydrateYourLeaguesHomeExpandedFromIdb().then((v) => {
      if (!cancel) setExpanded(v);
    });
    void hydrateYourLeaguesHomeHubExpandedFromIdb().then((v) => {
      if (!cancel) setHubUiExpanded(v);
    });
    return () => {
      cancel = true;
    };
  }, []);

  const leagueBodyKey = (hubId: string) => `${hubId}:body`;

  const isLeagueBodyExpanded = useCallback(
    (hubId: string) => hubUiExpanded[leagueBodyKey(hubId)] !== false,
    [hubUiExpanded]
  );

  const isScheduledExpanded = useCallback(
    (hubId: string) => hubUiExpanded[hubId] !== false,
    [hubUiExpanded]
  );

  const toggleLeagueBodyExpanded = useCallback((hubId: string) => {
    const key = leagueBodyKey(hubId);
    setHubUiExpanded((prev) => {
      const next: HubExpandedMap = {
        ...prev,
        [key]: prev[key] === false,
      };
      persistYourLeaguesHomeHubExpanded(next);
      return next;
    });
  }, []);

  const toggleScheduledExpanded = useCallback((hubId: string) => {
    setHubUiExpanded((prev) => {
      const next: HubExpandedMap = {
        ...prev,
        [hubId]: prev[hubId] === false,
      };
      persistYourLeaguesHomeHubExpanded(next);
      return next;
    });
  }, []);

  const toggleUnscheduledExpanded = useCallback((hubId: string) => {
    setUnscheduledExpanded((prev) => ({
      ...prev,
      [hubId]: !prev[hubId],
    }));
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
                    expanded={isLeagueBodyExpanded(hub.hubId)}
                    onToggleExpanded={() => toggleLeagueBodyExpanded(hub.hubId)}
                    hasBracketPlayoff={hubHasBracketLeagueGames(games, hub.hubId)}
                    bracketShortcutPath={buildLeagueHomeHubBracketPath(games, hub.hubId)}
                  />
                  <div
                    className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
                    style={{
                      gridTemplateRows: isLeagueBodyExpanded(hub.hubId) ? '1fr' : '0fr',
                    }}
                  >
                    <div className="flex min-h-0 flex-col gap-1.5 overflow-hidden">
                      <YourLeaguesHomeSeasonScheduledGamesExpandable
                        hubGames={scheduledGames}
                        gamesUnreadCounts={gamesUnreadCounts}
                        expanded={isScheduledExpanded(hub.hubId)}
                        onToggleExpanded={() => toggleScheduledExpanded(hub.hubId)}
                        titleKey="home.leagueSeasonScheduledGames"
                      />
                      <YourLeaguesHomeSeasonScheduledGamesExpandable
                        hubGames={unscheduledGames}
                        gamesUnreadCounts={gamesUnreadCounts}
                        expanded={!!unscheduledExpanded[hub.hubId]}
                        onToggleExpanded={() => toggleUnscheduledExpanded(hub.hubId)}
                        titleKey="home.leagueSeasonUnscheduledGames"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
