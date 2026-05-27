import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useContextUnread } from '@/hooks/useUnreadBridge';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  MapPin,
  MessageCircle,
  Plane,
  Users,
} from 'lucide-react';
import type { Game } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import type { LeagueSeasonHubRow } from '@/utils/leagueSeasonHubsFromGames';

interface YourLeaguesHomeSeasonOpenRowProps {
  hub: LeagueSeasonHubRow;
  hubGame: Game | undefined;
  unread: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  hasBracketPlayoff?: boolean;
  bracketShortcutPath?: string | null;
}

export function YourLeaguesHomeSeasonOpenRow({
  hub,
  hubGame,
  unread: unreadProp,
  expanded,
  onToggleExpanded,
  hasBracketPlayoff = false,
  bracketShortcutPath = null,
}: YourLeaguesHomeSeasonOpenRowProps) {
  const displayUnread = useContextUnread('GAME', hub.hubId, unreadProp);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { translateCity } = useTranslatedGeo();
  const userCityId = user?.currentCity?.id || user?.currentCityId;
  const stale = hub.stalePastSchedule;
  const gameCityId = hubGame?.city?.id;
  const isDifferentCity = Boolean(gameCityId && userCityId && gameCityId !== userCityId);
  const clubName = hubGame?.court?.club?.name || hubGame?.club?.name;
  const playingCount = (hubGame?.participants ?? []).filter((p) => p.status === 'PLAYING').length;

  const seasonLabel = (
    <>
      <p
        className={
          stale
            ? 'mt-0.5 truncate text-xs font-medium text-amber-900 dark:text-amber-100'
            : 'truncate text-sm font-semibold text-gray-900 dark:text-white'
        }
      >
        {stale
          ? `${hub.seasonTitle}${
              hub.leagueName && hub.leagueName !== hub.seasonTitle ? ` — ${hub.leagueName}` : ''
            }`
          : hub.seasonTitle}
      </p>
      {!stale && hub.leagueName && hub.leagueName !== hub.seasonTitle && (
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">{hub.leagueName}</p>
      )}
    </>
  );

  return (
    <div className="flex items-stretch">
      <button
        type="button"
        onClick={() => navigate(`/games/${hub.hubId}`)}
        className="flex min-h-[3.25rem] min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-gray-100/80 active:bg-gray-100 dark:hover:bg-gray-800/60 dark:active:bg-gray-800"
      >
        {stale ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white dark:bg-amber-600">
            <AlertTriangle size={16} strokeWidth={2.25} />
          </div>
        ) : hub.avatarUrl ? (
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-700">
            <img src={hub.avatarUrl} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          {stale ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex shrink-0 rounded border border-amber-700 bg-amber-200/90 px-1 py-px text-[10px] font-bold uppercase tracking-wide text-amber-950 dark:border-amber-500 dark:bg-amber-800/80 dark:text-amber-100">
                {t('home.staleGameBadge', { defaultValue: 'Time passed' })}
              </span>
              {isDifferentCity && hubGame?.city?.name && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-yellow-300 bg-yellow-50 px-1 py-px text-[10px] font-medium text-yellow-700 dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                  <Plane size={8} />
                  {translateCity(hubGame.city.id, hubGame.city.name, hubGame.city.country)}
                </span>
              )}
              {clubName && (
                <>
                  <span className="text-xs text-gray-300 dark:text-gray-600">•</span>
                  <span className="flex min-w-0 items-center gap-1 truncate text-sm font-medium text-amber-900 dark:text-amber-200/90">
                    <MapPin size={12} className="shrink-0" />
                    {clubName}
                  </span>
                </>
              )}
            </div>
          ) : (
            ((isDifferentCity && hubGame?.city?.name) || clubName) && (
              <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                {isDifferentCity && hubGame?.city?.name && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-yellow-300 bg-yellow-50 px-1 py-px text-[10px] font-medium text-yellow-700 dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                    <Plane size={8} />
                    {translateCity(hubGame.city.id, hubGame.city.name, hubGame.city.country)}
                  </span>
                )}
                {clubName && (
                  <>
                    <span className="text-xs text-gray-300 dark:text-gray-600">•</span>
                    <span className="flex min-w-0 items-center gap-1 truncate text-sm text-gray-600 dark:text-gray-400">
                      <MapPin size={12} className="shrink-0" />
                      {clubName}
                    </span>
                  </>
                )}
              </div>
            )
          )}
          {seasonLabel}
          {hasBracketPlayoff && !stale && (
            <span className="mt-1 inline-flex shrink-0 rounded border border-indigo-200 bg-indigo-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
              {t('home.leagueSeasonPlayoffBadge', { defaultValue: 'Playoffs' })}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {bracketShortcutPath && !stale && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(bracketShortcutPath);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-800 transition-colors hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200 dark:hover:bg-indigo-900/60"
              aria-label={t('home.leagueSeasonBracketShortcut', { defaultValue: 'Open bracket' })}
            >
              <LayoutGrid size={12} aria-hidden />
              {t('home.leagueSeasonBracketShortcut', { defaultValue: 'Bracket' })}
            </button>
          )}
          {displayUnread > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              <MessageCircle size={10} strokeWidth={2.5} />
              {displayUnread > 99 ? '99+' : displayUnread}
            </span>
          )}
          {hubGame && (
            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <Users size={12} />
              {hubGame.entityType === 'BAR'
                ? playingCount
                : `${playingCount}/${hubGame.maxParticipants}`}
            </span>
          )}
          <ChevronRight size={18} className="shrink-0 text-gray-400 dark:text-gray-500" aria-hidden />
        </div>
      </button>
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        aria-label={t('home.toggleLeagueGames', { defaultValue: 'Show or hide games' })}
        className="flex w-11 shrink-0 items-center justify-center self-stretch border-l border-gray-200/80 text-gray-400 transition-colors hover:bg-gray-100/80 hover:text-gray-600 active:bg-gray-100 dark:border-gray-700/80 dark:text-gray-500 dark:hover:bg-gray-800/60 dark:hover:text-gray-300 dark:active:bg-gray-800"
      >
        <ChevronDown
          size={20}
          strokeWidth={2}
          className={`transition-transform duration-200 ease-out motion-reduce:transition-none ${
            expanded ? '' : '-rotate-90'
          }`}
          aria-hidden
        />
      </button>
    </div>
  );
}
