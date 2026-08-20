import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, ChevronRight, Loader2, MapPin, Users } from 'lucide-react';
import type { UserTeamInvitableGame } from '@/api/userTeams';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { formatGameTimeInTimezone, getDateLabelInClubTz } from '@/utils/gameTimeDisplay';

type Props = {
  game: UserTeamInvitableGame;
  disabled?: boolean;
  submitting?: boolean;
  onSelect: (gameId: string) => void;
};

export function UserTeamInvitableGameRow({ game, disabled, submitting, onSelect }: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const tz = game.city?.timezone;
  const dateLabel =
    game.timeIsSet && tz
      ? getDateLabelInClubTz(game.startTime, tz, displaySettings, t)
      : null;
  const timeLabel =
    game.timeIsSet && tz ? formatGameTimeInTimezone(game.startTime, tz, displaySettings) : null;
  const clubName = game.club?.name;
  const title = game.name?.trim() || clubName || t('teams.team');
  const thumb = game.avatar || game.club?.avatar;

  return (
    <button
      type="button"
      data-testid="user-team-game-picker-row"
      disabled={disabled}
      aria-busy={submitting || undefined}
      onClick={() => onSelect(game.id)}
      className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200/90 bg-white px-3 py-2.5 text-left shadow-xs transition-[border-color,box-shadow,transform] hover:border-primary-300/80 hover:shadow-sm active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 dark:border-zinc-700/80 dark:bg-zinc-900/80 dark:hover:border-primary-500/40"
    >
      {thumb ? (
        <img src={thumb} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          <Calendar size={16} aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          {dateLabel ? <span className="font-medium text-zinc-700 dark:text-zinc-200">{dateLabel}</span> : null}
          {timeLabel ? (
            <>
              {dateLabel ? <span className="text-zinc-300 dark:text-zinc-600">·</span> : null}
              <span>{timeLabel}</span>
            </>
          ) : null}
          {clubName && clubName !== title ? (
            <>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <span className="inline-flex min-w-0 items-center gap-0.5 truncate">
                <MapPin size={11} className="shrink-0" aria-hidden />
                {clubName}
              </span>
            </>
          ) : null}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            <Users size={11} aria-hidden />
            {t('teams.slots', { playing: game.playingCount, max: game.maxParticipants })}
          </span>
          {game.hasFixedTeams ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
              {t('teams.fixedPairsBadge')}
            </span>
          ) : null}
          {game.partnerOnGame === 'playing' ? (
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
              {t('teams.partnerAlreadyIn')}
            </span>
          ) : null}
          {game.partnerOnGame === 'invited' ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              {t('teams.partnerInvited')}
            </span>
          ) : null}
        </span>
      </span>
      {submitting ? (
        <Loader2 size={16} className="shrink-0 animate-spin text-primary-600 dark:text-primary-400" aria-hidden />
      ) : (
        <ChevronRight size={16} className="shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden />
      )}
    </button>
  );
}
