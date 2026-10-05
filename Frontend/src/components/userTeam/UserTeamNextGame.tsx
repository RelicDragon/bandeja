import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronRight, MapPin } from 'lucide-react';
import { userTeamsApi } from '@/api/userTeams';
import { queryKeys } from '@/queries/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { formatGameTimeInTimezone, getDateLabelInClubTz } from '@/utils/gameTimeDisplay';
import { userTeamColorTones } from '@/utils/userTeamColor';

function dayParts(iso: string, timeZone: string | undefined, locale: string): { day: string; month: string } {
  const date = new Date(iso);
  try {
    return {
      day: new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone }).format(date),
      month: new Intl.DateTimeFormat(locale, { month: 'short', timeZone }).format(date),
    };
  } catch {
    return { day: String(date.getDate()), month: '' };
  }
}

/**
 * "Next game together": the soonest announced, timed game where both members
 * are PLAYING (`GET /user-teams/:id/next-game`). Tap opens the game. Renders
 * nothing while loading, on error or when there is no such game.
 */
export function UserTeamNextGame({ teamId, teamColor }: { teamId: string; teamColor?: string | null }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const reduceMotion = usePrefersReducedMotion();
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);

  const query = useQuery({
    queryKey: queryKeys.userTeams.nextGame(teamId),
    queryFn: () => userTeamsApi.getNextGame(teamId),
    staleTime: 60 * 1000,
  });

  const game = query.data;
  if (!game) return null;

  const tz = game.city?.timezone;
  const dateLabel = tz ? getDateLabelInClubTz(game.startTime, tz, displaySettings, t) : null;
  const timeLabel = tz ? formatGameTimeInTimezone(game.startTime, tz, displaySettings) : null;
  const clubName = game.club?.name ?? null;
  const title = game.name?.trim() || clubName || t('teams.nextGame.untitled');
  const { day, month } = dayParts(game.startTime, tz, i18n.language);
  const tones = userTeamColorTones(teamColor);
  const tileStyle = tones
    ? { backgroundImage: `linear-gradient(145deg, ${tones.light}, ${tones.dark})` }
    : undefined;

  return (
    <motion.button
      type="button"
      data-testid="user-team-next-game"
      onClick={() => navigate(`/games/${game.id}`)}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 30 }}
      className={`group flex w-full items-center gap-3.5 rounded-[1.375rem] bg-[var(--ui-surface)] px-3.5 py-3 text-start shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)] outline-none ring-1 ring-black/[0.04] transition-[scale,box-shadow] duration-200 hover:shadow-[0_18px_40px_-28px_rgba(15,23,42,0.55)] focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.985] dark:ring-white/[0.06] ${pressScaleGuard}`}
    >
      <span
        className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl text-white shadow-md ${
          tones ? '' : 'bg-gradient-to-br from-primary-500 to-primary-700 shadow-primary-600/25'
        }`}
        style={tileStyle}
        aria-hidden
      >
        <span className="text-[17px] font-bold leading-none tabular-nums">{day}</span>
        {month ? (
          <span className="mt-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-white/80">
            {month}
          </span>
        ) : null}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-primary-600 dark:text-primary-400">
          {t('teams.nextGame.eyebrow')}
        </span>
        <span className="mt-0.5 block truncate text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          {dateLabel ? <span className="shrink-0 font-medium text-zinc-700 dark:text-zinc-200">{dateLabel}</span> : null}
          {timeLabel ? (
            <>
              {dateLabel ? <span className="text-zinc-300 dark:text-zinc-600">·</span> : null}
              <span className="shrink-0 tabular-nums">{timeLabel}</span>
            </>
          ) : null}
          {clubName && clubName !== title ? (
            <>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <span className="inline-flex min-w-0 items-center gap-0.5">
                <MapPin size={11} className="shrink-0" aria-hidden />
                <span className="truncate">{clubName}</span>
              </span>
            </>
          ) : null}
        </span>
      </span>

      <ChevronRight
        size={18}
        className="shrink-0 text-zinc-300 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 dark:text-zinc-600"
        aria-hidden
      />
    </motion.button>
  );
}
