import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  MapPin,
  MessageCircle,
  Plane,
  Trophy,
  Users,
} from 'lucide-react';
import { Card } from '@/components';
import type { Game } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { getGameTimeDisplay } from '@/utils/gameTimeDisplay';
import { leagueSeasonHubsFromGames } from '@/utils/leagueSeasonHubsFromGames';
import {
  hydrateYourLeaguesHomeExpandedFromIdb,
  persistYourLeaguesHomeExpanded,
  readYourLeaguesHomeExpandedSync,
} from '@/utils/yourLeaguesHomeSectionStorage';

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
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { translateCity } = useTranslatedGeo();
  const displaySettings = user ? resolveDisplaySettings(user) : resolveDisplaySettings(null);
  const userCityId = user?.currentCity?.id || user?.currentCityId;
  const hubs = useMemo(() => leagueSeasonHubsFromGames(games), [games]);
  const [expanded, setExpanded] = useState(readYourLeaguesHomeExpandedSync);

  useEffect(() => {
    let cancel = false;
    void hydrateYourLeaguesHomeExpandedFromIdb().then((v) => {
      if (!cancel) setExpanded(v);
    });
    return () => {
      cancel = true;
    };
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
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {t('home.yourLeagues', { defaultValue: 'Your leagues' })}
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
          <div className="flex flex-col gap-1 px-1 pt-2">
            {hubs.map((hub) => {
              const unread = gamesUnreadCounts[hub.hubId] ?? 0;
              const hubGame = games.find((g) => g.id === hub.hubId && g.entityType === 'LEAGUE_SEASON');
              const stale = hub.stalePastSchedule;
              const gameCityId = hubGame?.city?.id;
              const isDifferentCity = Boolean(gameCityId && userCityId && gameCityId !== userCityId);
              const clubName = hubGame?.court?.club?.name || hubGame?.club?.name;
              const playingCount = (hubGame?.participants ?? []).filter((p) => p.status === 'PLAYING').length;
              const showTime = hubGame && !(hubGame.entityType === 'LEAGUE_SEASON' && hubGame.timeIsSet === false);
              const timeDisplay =
                hubGame && showTime
                  ? getGameTimeDisplay({
                      game: hubGame,
                      displaySettings,
                      startTime: hubGame.startTime,
                      endTime: hubGame.endTime,
                      kind: 'time',
                      t,
                    })
                  : null;

              if (stale) {
                return (
                  <button
                    key={hub.hubId}
                    type="button"
                    onClick={() => navigate(`/games/${hub.hubId}`)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left transition-all cursor-pointer active:scale-[0.98] border-2 border-amber-600 dark:border-amber-500 bg-white/80 dark:bg-gray-900/80 shadow-md"
                  >
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white dark:bg-amber-600">
                      <AlertTriangle size={16} strokeWidth={2.25} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex flex-shrink-0 rounded border border-amber-700 bg-amber-200/90 px-1 py-px text-[10px] font-bold uppercase tracking-wide text-amber-950 dark:border-amber-500 dark:bg-amber-800/80 dark:text-amber-100">
                          {t('home.staleGameBadge', { defaultValue: 'Time passed' })}
                        </span>
                        {isDifferentCity && hubGame?.city?.name && (
                          <span className="inline-flex flex-shrink-0 items-center gap-0.5 rounded border border-yellow-300 bg-yellow-50 px-1 py-px text-[10px] font-medium text-yellow-700 dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                            <Plane size={8} />
                            {translateCity(hubGame.city.id, hubGame.city.name, hubGame.city.country)}
                          </span>
                        )}
                        {timeDisplay && (
                          <span className="truncate text-sm font-bold text-amber-950 dark:text-amber-50">
                            {timeDisplay.primaryText}
                          </span>
                        )}
                        {clubName && (
                          <>
                            <span className="text-xs text-gray-300 dark:text-gray-600">•</span>
                            <span className="flex min-w-0 items-center gap-1 truncate text-sm font-medium text-amber-900 dark:text-amber-200/90">
                              <MapPin size={12} className="flex-shrink-0" />
                              {clubName}
                            </span>
                          </>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs font-medium text-amber-900/85 dark:text-amber-200/80">
                        {hub.seasonTitle}
                        {hub.leagueName && hub.leagueName !== hub.seasonTitle ? ` — ${hub.leagueName}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {unread > 0 && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          <MessageCircle size={10} strokeWidth={2.5} />
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                      {hubGame && (
                        <div className="flex items-center gap-1 text-xs font-semibold text-amber-900 dark:text-amber-200">
                          <Users size={12} />
                          <span>
                            {hubGame.entityType === 'BAR'
                              ? playingCount
                              : `${playingCount}/${hubGame.maxParticipants}`}
                          </span>
                        </div>
                      )}
                      <ChevronRight size={18} className="text-gray-400 dark:text-gray-500" />
                    </div>
                  </button>
                );
              }

              return (
                <button
                  key={hub.hubId}
                  type="button"
                  onClick={() => navigate(`/games/${hub.hubId}`)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-[0.99]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400">
                    {hub.avatarUrl ? (
                      <img src={hub.avatarUrl} alt="" className="h-10 w-10 object-cover" />
                    ) : (
                      <Trophy size={20} strokeWidth={2} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    {((isDifferentCity && hubGame?.city?.name) || timeDisplay || clubName) && (
                      <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                        {isDifferentCity && hubGame?.city?.name && (
                          <span className="inline-flex flex-shrink-0 items-center gap-0.5 rounded border border-yellow-300 bg-yellow-50 px-1 py-px text-[10px] font-medium text-yellow-700 dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                            <Plane size={8} />
                            {translateCity(hubGame.city.id, hubGame.city.name, hubGame.city.country)}
                          </span>
                        )}
                        {timeDisplay && (
                          <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                            {timeDisplay.primaryText}
                          </span>
                        )}
                        {clubName && (
                          <>
                            <span className="text-xs text-gray-300 dark:text-gray-600">•</span>
                            <span className="flex min-w-0 items-center gap-1 truncate text-sm text-gray-600 dark:text-gray-400">
                              <MapPin size={12} className="flex-shrink-0" />
                              {clubName}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{hub.seasonTitle}</p>
                    {hub.leagueName && hub.leagueName !== hub.seasonTitle && (
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">{hub.leagueName}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {unread > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        <MessageCircle size={10} strokeWidth={2.5} />
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                    {hubGame && (
                      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <Users size={12} />
                        <span>
                          {hubGame.entityType === 'BAR'
                            ? playingCount
                            : `${playingCount}/${hubGame.maxParticipants}`}
                        </span>
                      </div>
                    )}
                    <ChevronRight size={18} className="shrink-0 text-gray-400 dark:text-gray-500" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
