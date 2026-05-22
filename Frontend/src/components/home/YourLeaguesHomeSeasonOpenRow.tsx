import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useContextUnread } from '@/hooks/useUnreadBridge';
import {
  AlertTriangle,
  ChevronRight,
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
}

export function YourLeaguesHomeSeasonOpenRow({ hub, hubGame, unread: unreadProp }: YourLeaguesHomeSeasonOpenRowProps) {
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

  const rowClass = stale
    ? 'flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left transition-all border-2 border-amber-600 dark:border-amber-500 bg-white/80 dark:bg-gray-900/80 shadow-md hover:bg-amber-50/50 dark:hover:bg-amber-950/20 active:scale-[0.99]'
    : 'flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-[0.99]';

  const seasonLabel = (
    <>
      <p
        className={
          stale
            ? 'mt-0.5 truncate text-xs font-medium text-amber-900/85 dark:text-amber-200/80'
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
    <button type="button" onClick={() => navigate(`/games/${hub.hubId}`)} className={rowClass}>
      {stale ? (
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white dark:bg-amber-600">
          <AlertTriangle size={16} strokeWidth={2.25} />
        </div>
      ) : (
        hub.avatarUrl ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-50 dark:bg-blue-950/50">
            <img src={hub.avatarUrl} alt="" className="h-10 w-10 object-cover" />
          </div>
        ) : null
      )}
      <div className="min-w-0 flex-1">
        {stale ? (
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
        ) : (
          ((isDifferentCity && hubGame?.city?.name) || clubName) && (
            <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
              {isDifferentCity && hubGame?.city?.name && (
                <span className="inline-flex flex-shrink-0 items-center gap-0.5 rounded border border-yellow-300 bg-yellow-50 px-1 py-px text-[10px] font-medium text-yellow-700 dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                  <Plane size={8} />
                  {translateCity(hubGame.city.id, hubGame.city.name, hubGame.city.country)}
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
          )
        )}
        {seasonLabel}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {displayUnread > 0 && (
          <span
            className={
              stale
                ? 'inline-flex items-center gap-0.5 rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] font-bold text-white'
                : 'inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] font-bold text-white'
            }
          >
            <MessageCircle size={10} strokeWidth={2.5} />
            {displayUnread > 99 ? '99+' : displayUnread}
          </span>
        )}
        {hubGame && (
          <div
            className={
              stale
                ? 'flex items-center gap-1 text-xs font-semibold text-amber-900 dark:text-amber-200'
                : 'flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400'
            }
          >
            <Users size={12} />
            <span>
              {hubGame.entityType === 'BAR'
                ? playingCount
                : `${playingCount}/${hubGame.maxParticipants}`}
            </span>
          </div>
        )}
        <ChevronRight size={18} className="shrink-0 text-gray-400 dark:text-gray-500" aria-hidden />
      </div>
    </button>
  );
}
