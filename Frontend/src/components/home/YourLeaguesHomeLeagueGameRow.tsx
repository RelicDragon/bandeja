import { useTranslation } from 'react-i18next';
import { Calendar, MapPin, MessageCircle, Users } from 'lucide-react';
import type { Game } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useContextUnread } from '@/hooks/useUnreadBridge';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import {
  getClubTimezone,
  getDateLabelInClubTz,
  getGameTimeDisplay,
} from '@/utils/gameTimeDisplay';
import { formatDate } from '@/utils/dateFormat';

interface YourLeaguesHomeLeagueGameRowProps {
  game: Game;
  unreadCount?: number;
  /** Unscheduled league list — section title already states time is TBD. */
  omitDatetimeNotSetLabel?: boolean;
  onClick: () => void;
}

export function YourLeaguesHomeLeagueGameRow({
  game,
  unreadCount: unreadProp = 0,
  omitDatetimeNotSetLabel = false,
  onClick,
}: YourLeaguesHomeLeagueGameRowProps) {
  const displayUnread = useContextUnread('GAME', game.id, unreadProp);
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const displaySettings = user ? resolveDisplaySettings(user) : resolveDisplaySettings(null);
  const clubTz = getClubTimezone(game);
  const timeNotSet = game.timeIsSet !== true;
  const dateLabel = timeNotSet
    ? null
    : clubTz
      ? getDateLabelInClubTz(game.startTime, clubTz, displaySettings, t)
      : `${formatDate(game.startTime, 'EEEE').slice(0, 3)}, ${formatDate(game.startTime, 'd MMM')}`;
  const timeDisplay = timeNotSet
    ? null
    : getGameTimeDisplay({
        game,
        displaySettings,
        startTime: game.startTime,
        endTime: game.endTime,
        kind: 'time',
        t,
      });
  const clubName = game.court?.club?.name || game.club?.name;
  const playingCount = (game.participants ?? []).filter((p) => p.status === 'PLAYING').length;
  const groupName = game.leagueGroup?.name;
  const roundIndex = game.leagueRound?.orderIndex;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-[0.99]"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
        <Calendar size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {!timeNotSet && (
            <>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                {dateLabel}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">·</span>
              <span className="text-xs font-medium text-gray-900 dark:text-white">
                {timeDisplay!.primaryText}
              </span>
            </>
          )}
          {timeNotSet && !omitDatetimeNotSetLabel && (
            <span className="text-xs font-medium italic text-gray-500 dark:text-gray-400">
              {t('gameDetails.datetimeNotSet')}
            </span>
          )}
          {clubName && (
            <>
              {!timeNotSet && (
                <span className="text-xs text-gray-300 dark:text-gray-600">•</span>
              )}
              <span className="flex min-w-0 items-center gap-1 truncate text-xs text-gray-600 dark:text-gray-400">
                <MapPin size={11} className="flex-shrink-0" />
                {clubName}
              </span>
            </>
          )}
        </div>
        {(groupName || typeof roundIndex === 'number') && (
          <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
            {typeof roundIndex === 'number' &&
              t('league.roundShort', {
                index: roundIndex + 1,
                defaultValue: `R${roundIndex + 1}`,
              })}
            {typeof roundIndex === 'number' && groupName ? ' · ' : ''}
            {groupName}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {displayUnread > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            <MessageCircle size={10} strokeWidth={2.5} />
            {displayUnread > 99 ? '99+' : displayUnread}
          </span>
        )}
        <div className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
          <Users size={11} />
          <span>
            {playingCount}/{game.maxParticipants}
          </span>
        </div>
      </div>
    </button>
  );
}
