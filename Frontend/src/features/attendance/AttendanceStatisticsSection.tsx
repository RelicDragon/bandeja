/**
 * PRD 346 — Profile → Statistics: the "Shows up" tile, a 12-month sparkline and
 * the viewer's own no-show notes with a link into each game chat.
 *
 * Own profile only: nobody browses somebody else's no-show notes. The bars are
 * a single sky tone for attended and a neutral grey for missed — never red.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { attendanceApi } from '@/api/attendance';
import { queryKeys } from '@/queries/queryKeys';
import { navigationService } from '@/services/navigationService';
import type { Sport } from '@shared/sport';
import { ShowsUpTile } from './ShowsUpTile';
import { shouldShowAttendanceRate } from './attendanceVisuals';
import { resolveIntlLocale } from '@/utils/intlLocale';

export interface AttendanceStatisticsSectionProps {
  /** Rendered only on the viewer's own profile. */
  isOwnProfile: boolean;
  sport?: Sport;
}

function monthLabel(monthKey: string, locale: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  try {
    return new Intl.DateTimeFormat(resolveIntlLocale(locale), { month: 'short' }).format(new Date(year, month - 1, 1));
  } catch {
    return monthKey;
  }
}

export function AttendanceStatisticsSection({
  isOwnProfile,
  sport,
}: AttendanceStatisticsSectionProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || 'en';

  const statsQuery = useQuery({
    queryKey: queryKeys.attendance.myRate(sport),
    queryFn: () => attendanceApi.myStats(sport),
    enabled: isOwnProfile,
    staleTime: 5 * 60_000,
  });

  const notesQuery = useQuery({
    queryKey: queryKeys.attendance.myNotes,
    queryFn: () => attendanceApi.myNoShowNotes(),
    enabled: isOwnProfile,
    staleTime: 5 * 60_000,
  });

  const stats = statsQuery.data;
  const monthly = useMemo(() => stats?.monthly ?? [], [stats?.monthly]);
  const peak = useMemo(
    () => Math.max(1, ...monthly.map((point) => point.attended + point.noShow)),
    [monthly],
  );

  /**
   * The 5-game floor belongs to the **rate** — a single missed game must never
   * read as a verdict. It does not belong to the viewer's own no-show notes:
   * the note's push promises "if that's wrong, reply in the game chat", and
   * that link has to exist from the first note, not from the fifth game.
   */
  const showRate = shouldShowAttendanceRate(stats);
  const notes = notesQuery.data ?? [];

  if (!isOwnProfile) return null;
  if (!showRate && notes.length === 0) return null;

  return (
    <div className="space-y-3 rounded-xl border border-gray-200/60 bg-gray-50 p-3 dark:border-gray-600/50 dark:bg-gray-700/50">
      <ShowsUpTile summary={stats} />

      {showRate ? (
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
              {t('attendance.stat.sparklineTitle')}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              {t('attendance.stat.sparklineLegend')}
            </p>
          </div>
          <ul className="flex h-14 items-end gap-1">
            {monthly.map((point) => {
              const month = monthLabel(point.monthKey, locale);
              const attendedHeight = Math.round((point.attended / peak) * 100);
              const missedHeight = Math.round((point.noShow / peak) * 100);
              return (
                <li
                  key={point.monthKey}
                  className="flex h-full flex-1 flex-col justify-end gap-0.5"
                  title={t('attendance.stat.sparklineMonthAria', {
                    month,
                    attended: point.attended,
                    noShow: point.noShow,
                  })}
                >
                  <span className="sr-only">
                    {t('attendance.stat.sparklineMonthAria', {
                      month,
                      attended: point.attended,
                      noShow: point.noShow,
                    })}
                  </span>
                  {missedHeight > 0 ? (
                    <span
                      aria-hidden
                      className="block w-full rounded-sm bg-gray-300 dark:bg-gray-500"
                      style={{ height: `${Math.max(4, missedHeight)}%` }}
                    />
                  ) : null}
                  <span
                    aria-hidden
                    className="block w-full rounded-sm bg-primary-400 dark:bg-primary-500"
                    style={{ height: `${Math.max(attendedHeight > 0 ? 4 : 2, attendedHeight)}%` }}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div>
        <p className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-200">
          {t('attendance.stat.notesTitle')}
        </p>
        {notes.length > 0 ? (
          <ul className="space-y-1">
            {notes.map((note) => (
              <li
                key={`${note.gameId}-${note.notedAt}`}
                className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 dark:bg-gray-800"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-900 dark:text-white">
                    {note.gameName || note.clubName || ''}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {t('attendance.stat.notedOn', {
                      date: new Date(note.notedAt).toLocaleDateString(locale),
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigationService.navigateToGame(note.gameId, true)}
                  aria-label={t('attendance.stat.notesOpenChat')}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-primary-600 transition-colors hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-950/40"
                >
                  <MessageCircle size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('attendance.stat.notesEmpty')}
          </p>
        )}
      </div>
    </div>
  );
}
