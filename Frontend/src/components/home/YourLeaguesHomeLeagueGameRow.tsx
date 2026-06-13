import { useTranslation } from 'react-i18next';
import { Calendar, MapPin, MessageCircle, Trophy } from 'lucide-react';
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
import { getLeagueHomeGameMatchup } from '@/utils/leagueHomeGameMatchup';
import { getLeagueHomeBracketRowContext } from '@/utils/leagueHomeBracket.util';
import { YourLeaguesHomeLeagueGameMatchup } from './YourLeaguesHomeLeagueGameMatchup';

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
  const groupName = game.leagueGroup?.name;
  const roundIndex = game.leagueRound?.orderIndex;
  const matchup = getLeagueHomeGameMatchup(game, user?.id);
  const bracketCtx = getLeagueHomeBracketRowContext(game);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col gap-1.5 rounded-lg border border-gray-200/80 bg-white px-2.5 py-2 text-left shadow-xs transition-[border-color,box-shadow,transform] hover:border-gray-300 hover:shadow-sm active:scale-[0.99] dark:border-gray-700/80 dark:bg-gray-900/90 dark:hover:border-gray-600"
    >
      <div className="flex w-full min-w-0 items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
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
        {(bracketCtx || groupName || typeof roundIndex === 'number') && (
          <p className="mt-0.5 flex flex-wrap items-center gap-1 truncate text-[11px] text-gray-500 dark:text-gray-400">
            {bracketCtx && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-indigo-200 bg-indigo-50 px-1 py-px font-semibold text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
                <Trophy size={9} aria-hidden />
                {bracketCtx.isSeasonPlayoff
                  ? t('home.leagueGameSeasonPlayoffBadge', { defaultValue: 'Season playoff' })
                  : t('home.leagueGameBracketBadge', { defaultValue: 'Bracket' })}
              </span>
            )}
            {omitDatetimeNotSetLabel && bracketCtx?.urgency === 'PLAY_IN' && (
              <span className="inline-flex shrink-0 rounded border border-amber-300 bg-amber-50 px-1 py-px font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
                {t('home.leagueGameBracketPlayInUrgency', { defaultValue: 'Schedule play-in first' })}
              </span>
            )}
            {omitDatetimeNotSetLabel && bracketCtx?.urgency === 'KNOCKOUT' && (
              <span className="inline-flex shrink-0 rounded border border-slate-300 bg-slate-50 px-1 py-px font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-200">
                {t('home.leagueGameBracketKnockoutUrgency', { defaultValue: 'Knockout match' })}
              </span>
            )}
            {typeof (bracketCtx?.roundIndex ?? roundIndex) === 'number' && (
              <span>
                {t('league.roundShort', {
                  index: (bracketCtx?.roundIndex ?? roundIndex)! + 1,
                  defaultValue: `R${(bracketCtx?.roundIndex ?? roundIndex)! + 1}`,
                })}
              </span>
            )}
            {(bracketCtx?.groupName ?? groupName) && (
              <>
                {typeof (bracketCtx?.roundIndex ?? roundIndex) === 'number' ? (
                  <span aria-hidden>·</span>
                ) : null}
                <span className="truncate">{bracketCtx?.groupName ?? groupName}</span>
              </>
            )}
          </p>
        )}
        </div>
        {displayUnread > 0 && (
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            <MessageCircle size={10} strokeWidth={2.5} />
            {displayUnread > 99 ? '99+' : displayUnread}
          </span>
        )}
      </div>
      {matchup && (
        <div className="w-full min-w-0">
          <YourLeaguesHomeLeagueGameMatchup matchup={matchup} />
        </div>
      )}
    </button>
  );
}
