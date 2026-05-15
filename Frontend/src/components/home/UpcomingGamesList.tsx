import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format, startOfDay } from 'date-fns';
import { AlertTriangle, Calendar, ChevronDown, MapPin, Users, Plane } from 'lucide-react';
import { Card, GameCard } from '@/components';
import { Game } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { getGameTimeDisplay, getClubTimezone, getDateLabelInClubTz } from '@/utils/gameTimeDisplay';
import { formatDate } from '@/utils/dateFormat';
import type { TFunction } from 'i18next';
import { isStalePastScheduledGame } from '@/utils/homeStaleScheduledGame';
import { getEntityIcon, getEntityTagClasses } from '@/components/home/HomeGameRowEntityTags';

interface UpcomingGamesListProps {
  games: Game[];
  user?: any;
  gamesUnreadCounts?: Record<string, number>;
  onNoteSaved?: (gameId: string) => void;
}

interface DateGroup {
  dateStr: string;
  label: string;
  games: Game[];
}

function groupGamesByDate(
  gameList: Game[],
  displaySettings: ReturnType<typeof resolveDisplaySettings>,
  t: TFunction
): DateGroup[] {
  const map = new Map<string, Game[]>();
  for (const g of gameList) {
    const key = format(startOfDay(new Date(g.startTime)), 'yyyy-MM-dd');
    const arr = map.get(key) || [];
    arr.push(g);
    map.set(key, arr);
  }
  const result: DateGroup[] = [];
  for (const [dateStr, dateGames] of map) {
    const sample = dateGames[0];
    const clubTz = getClubTimezone(sample);
    const label = clubTz
      ? getDateLabelInClubTz(sample.startTime, clubTz, displaySettings, t)
      : `${formatDate(sample.startTime, 'EEEE').slice(0, 3)}, ${formatDate(sample.startTime, 'd MMM')}`;
    result.push({ dateStr, label, games: dateGames });
  }
  result.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  return result;
}

export const UpcomingGamesList = ({
  games,
  user: viewerUser,
  gamesUnreadCounts = {},
  onNoteSaved,
}: UpcomingGamesListProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);
  const effectiveUser = viewerUser ?? authUser;
  const { translateCity } = useTranslatedGeo();
  const displaySettings = effectiveUser
    ? resolveDisplaySettings(effectiveUser)
    : resolveDisplaySettings(null);
  const userCityId = effectiveUser?.currentCity?.id || effectiveUser?.currentCityId;

  const gamesWithoutLeagueSeasonHub = useMemo(
    () => games.filter((g) => g.entityType !== 'LEAGUE_SEASON'),
    [games]
  );

  const { staleGames, upcomingGames } = useMemo(() => {
    const stale: Game[] = [];
    const upcoming: Game[] = [];
    for (const g of gamesWithoutLeagueSeasonHub) {
      if (isStalePastScheduledGame(g)) stale.push(g);
      else upcoming.push(g);
    }
    stale.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    return { staleGames: stale, upcomingGames: upcoming };
  }, [gamesWithoutLeagueSeasonHub]);

  const staleGrouped = useMemo(
    () => groupGamesByDate(staleGames, displaySettings, t),
    [staleGames, displaySettings, t]
  );
  const upcomingGrouped = useMemo(
    () => groupGamesByDate(upcomingGames, displaySettings, t),
    [upcomingGames, displaySettings, t]
  );

  const [staleSectionOpen, setStaleSectionOpen] = useState(false);
  const staleCount = staleGames.length;

  if (staleGrouped.length === 0 && upcomingGrouped.length === 0) return null;

  const renderStaleGroup = (group: DateGroup) => (
    <div key={`stale-${group.dateStr}`}>
      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5 px-1">
        {group.label}
      </p>
      <div className="space-y-1.5">
        {group.games.map((game) => (
          <StaleScheduledGameRow
            key={game.id}
            game={game}
            userCityId={userCityId}
            displaySettings={displaySettings}
            translateCity={translateCity}
            onClick={() => navigate(`/games/${game.id}`)}
          />
        ))}
      </div>
    </div>
  );

  const renderUpcomingGroup = (group: DateGroup) => (
    <div key={`upcoming-${group.dateStr}`}>
      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
        {group.label}
      </p>
      <div className="space-y-4">
        {group.games.map((game) => (
          <div
            key={game.id}
            className="transition-all duration-500 ease-in-out animate-in slide-in-from-top-4"
          >
            <GameCard
              game={game}
              user={viewerUser}
              unreadCount={gamesUnreadCounts[game.id] || 0}
              onNoteSaved={onNoteSaved}
            />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {upcomingGrouped.length > 0 && (
        <Card className="py-4">
          <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2 px-1">
            <Calendar
              size={18}
              strokeWidth={2}
              className="shrink-0 text-gray-500 dark:text-gray-400"
              fill="none"
              aria-hidden
            />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t('home.upcomingGames')}
            </p>
            <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gray-900/5 px-1.5 text-[10px] font-semibold tabular-nums text-gray-600 dark:bg-white/10 dark:text-gray-300">
              {upcomingGames.length}
            </span>
          </div>
          <div className="space-y-4">{upcomingGrouped.map((g) => renderUpcomingGroup(g))}</div>
        </Card>
      )}

      {staleGrouped.length > 0 && (
        <Card className="py-4 border-2 border-amber-500 dark:border-amber-500 bg-amber-50/90 dark:bg-amber-950/35 shadow-lg shadow-amber-500/20 dark:shadow-amber-900/40 ring-1 ring-amber-400/60 dark:ring-amber-600/50">
          <button
            type="button"
            className="flex w-full gap-2 items-start text-left px-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-50 dark:focus-visible:ring-offset-amber-950"
            aria-expanded={staleSectionOpen}
            onClick={(e) => {
              e.stopPropagation();
              setStaleSectionOpen((v) => !v);
            }}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white dark:bg-amber-600">
              <AlertTriangle size={18} strokeWidth={2.25} />
            </div>
            <div className="min-w-0 flex-1 flex flex-wrap items-start gap-x-2 gap-y-1">
              <p className="text-sm font-semibold text-amber-950 dark:text-amber-100 leading-tight flex-1 min-w-[12rem]">
                {t('home.staleGamesTitle', { defaultValue: 'Scheduled time has passed — game was not played' })}
              </p>
              <span className="inline-flex shrink-0 items-center rounded-md border border-amber-700/50 dark:border-amber-500/60 bg-amber-200/90 dark:bg-amber-800/80 px-2 py-0.5 text-xs font-bold text-amber-950 dark:text-amber-50">
                {t('home.staleGamesCount', { count: staleCount })}
              </span>
            </div>
            <ChevronDown
              size={22}
              className={`shrink-0 text-amber-900 dark:text-amber-200 transition-transform duration-300 mt-0.5 ${staleSectionOpen ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
          <div
            className={`grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none ${staleSectionOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="pt-3 space-y-3">
                <p className="text-xs text-amber-900/90 dark:text-amber-200/90 leading-snug px-1">
                  {t('home.staleGamesHint', {
                    defaultValue: 'The organizer can cancel this listing or set a new date.',
                  })}
                </p>
                <div className="space-y-3">{staleGrouped.map((g) => renderStaleGroup(g))}</div>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

interface StaleScheduledGameRowProps {
  game: Game;
  userCityId?: string;
  displaySettings: ReturnType<typeof resolveDisplaySettings>;
  translateCity: (cityId: string, cityName: string, country: string) => string;
  onClick: () => void;
}

const StaleScheduledGameRow = ({
  game,
  userCityId,
  displaySettings,
  translateCity,
  onClick,
}: StaleScheduledGameRowProps) => {
  const { t } = useTranslation();
  const gameCityId = game.city?.id;
  const isDifferentCity = Boolean(gameCityId && userCityId && gameCityId !== userCityId);
  const clubName = game.court?.club?.name || game.club?.name;
  const playingCount = (game.participants ?? []).filter((p) => p.status === 'PLAYING').length;
  const showEntityType = game.entityType !== 'GAME';
  const showTime = !(game.entityType === 'LEAGUE_SEASON' && game.timeIsSet === false);

  const timeDisplay = getGameTimeDisplay({
    game,
    displaySettings,
    startTime: game.startTime,
    endTime: game.endTime,
    kind: 'time',
    t,
  });

  return (
    <div
      className="flex items-center gap-2.5 px-2 py-2.5 rounded-lg cursor-pointer active:scale-[0.98] transition-all border-2 border-amber-600 dark:border-amber-500 bg-white/80 dark:bg-gray-900/80 shadow-md"
      onClick={onClick}
    >
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-amber-500 text-white dark:bg-amber-600 flex-shrink-0">
        <AlertTriangle size={16} strokeWidth={2.25} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex text-[10px] font-bold uppercase tracking-wide border rounded px-1 py-px flex-shrink-0 text-amber-950 dark:text-amber-100 bg-amber-200/90 dark:bg-amber-800/80 border-amber-700 dark:border-amber-500">
            {t('home.staleGameBadge', { defaultValue: 'Time passed' })}
          </span>
          {showEntityType && (
            <span
              className={`inline-flex items-center gap-0.5 text-[10px] font-medium border rounded px-1 py-px flex-shrink-0 ${getEntityTagClasses(game.entityType)}`}
            >
              {getEntityIcon(game.entityType)}
              {t(`games.entityTypes.${game.entityType}`)}
            </span>
          )}
          {isDifferentCity && game.city?.name && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded px-1 py-px flex-shrink-0">
              <Plane size={8} />
              {translateCity(game.city.id, game.city.name, game.city.country)}
            </span>
          )}
          {showTime && (
            <span className="text-sm font-bold text-amber-950 dark:text-amber-50 truncate">
              {timeDisplay.primaryText}
            </span>
          )}
          {clubName && (
            <>
              <span className="text-gray-300 dark:text-gray-600 text-xs">•</span>
              <span className="text-sm text-amber-900 dark:text-amber-200/90 truncate flex items-center gap-1 font-medium">
                <MapPin size={12} className="flex-shrink-0" />
                {clubName}
              </span>
            </>
          )}
        </div>
        {game.name && (
          <p className="text-xs text-amber-900/85 dark:text-amber-200/80 truncate mt-0.5 font-medium">
            {game.name}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 text-xs text-amber-900 dark:text-amber-200 flex-shrink-0 font-semibold">
        <Users size={12} />
        <span>{game.entityType === 'BAR' ? playingCount : `${playingCount}/${game.maxParticipants}`}</span>
      </div>
    </div>
  );
};
