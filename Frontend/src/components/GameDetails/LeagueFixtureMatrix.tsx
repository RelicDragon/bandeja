import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Flame } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { LeagueRound } from '@/api/leagues';
import type { MatrixTeam } from '@/utils/leagueFixtureMatrix';
import type { BasicUser, Game } from '@/types';
import { PlayerAvatar } from '@/components';
import { AnnouncedFireIcon } from '@/components/AnnouncedFireIcon';
import { useAuthStore } from '@/store/authStore';
import type { ResolvedDisplaySettings } from '@/utils/displayPreferences';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import {
  buildPairCellMap,
  formatFixtureMatrixPlayerName,
  matchupKey,
  rowPerspectiveOutcome,
} from '@/utils/leagueFixtureMatrix';

interface LeagueFixtureMatrixProps {
  groupId: string;
  teams: MatrixTeam[];
  rounds: LeagueRound[];
  onFixtureCell: (payload: { games: Game[]; row: MatrixTeam; col: MatrixTeam }) => void;
  /** Use flex parent with bounded height; table scroll fills remaining space (fullscreen page). */
  fillViewportHeight?: boolean;
}

function FireOrStatic({ small }: { small?: boolean }) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const fn = () => setReduced(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  if (reduced) {
    return <Flame className={small ? 'h-3.5 w-3.5 text-orange-500' : 'h-5 w-5 text-orange-500'} aria-hidden />;
  }
  return <AnnouncedFireIcon className={small ? '[&>canvas]:max-w-3.5 [&>canvas]:max-h-3.5' : ''} />;
}

function pickPrimaryGame(games: Game[]): Game | undefined {
  if (games.length === 0) return undefined;
  const scored = [...games].sort((a, b) => {
    const af = a.resultsStatus === 'FINAL' ? 2 : a.timeIsSet && a.clubId ? 1 : 0;
    const bf = b.resultsStatus === 'FINAL' ? 2 : b.timeIsSet && b.clubId ? 1 : 0;
    if (bf !== af) return bf - af;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  return scored[0];
}

function cellLabel(
  t: TFunction,
  row: MatrixTeam,
  col: MatrixTeam,
  games: Game[],
  outcomeChar: string | null,
  live: boolean
): string {
  const base = `${row.label} ${t('gameDetails.fixtureVsShort')} ${col.label}`;
  if (games.length === 0) return `${base}, ${t('gameDetails.fixtureCellNotScheduled')}`;
  if (live) return `${base}, ${t('gameDetails.fixtureCellScheduled')}`;
  if (outcomeChar) return `${base}, ${t('gameDetails.fixtureCellPlayed')}: ${outcomeChar}`;
  return base;
}

function trimClubDisplay(name: string, maxLen: number): string {
  const t = name.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

function matrixCellScheduleHints(
  game: Game,
  display: ResolvedDisplaySettings
): { dateLine: string | null; clubLine: string | null } {
  let dateLine: string | null = null;
  if (game.timeIsSet && game.startTime) {
    try {
      dateLine = new Intl.DateTimeFormat(display.locale, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: display.hour12,
      }).format(new Date(game.startTime));
    } catch {
      dateLine = null;
    }
  }
  const rawClub =
    (typeof game.club?.name === 'string' && game.club.name.trim()) ||
    (typeof game.court?.club?.name === 'string' && game.court.club.name.trim()) ||
    '';
  const clubLine = game.clubId && rawClub ? trimClubDisplay(rawClub, 18) : null;
  return { dateLine, clubLine };
}

function outcomeBadgeClass(outcome: string): string {
  if (outcome === 'W') {
    return 'bg-emerald-500/[0.14] text-emerald-800 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.22)] dark:bg-emerald-400/12 dark:text-emerald-200 dark:shadow-[inset_0_0_0_1px_rgba(52,211,153,0.25)]';
  }
  if (outcome === 'L') {
    return 'bg-rose-500/[0.12] text-rose-800 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.2)] dark:bg-rose-400/12 dark:text-rose-200 dark:shadow-[inset_0_0_0_1px_rgba(251,113,133,0.22)]';
  }
  return 'bg-amber-500/[0.12] text-amber-900 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.22)] dark:bg-amber-400/12 dark:text-amber-100 dark:shadow-[inset_0_0_0_1px_rgba(251,191,36,0.2)]';
}

const stickyTeamShadow =
  'shadow-[4px_0_12px_-4px_rgba(15,23,42,0.07)] dark:shadow-[4px_0_14px_-4px_rgba(0,0,0,0.45)]';

export const LeagueFixtureMatrix = ({
  groupId,
  teams,
  rounds,
  onFixtureCell,
  fillViewportHeight = false,
}: LeagueFixtureMatrixProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);

  const pairMap = useMemo(() => buildPairCellMap(rounds, groupId), [rounds, groupId]);

  if (teams.length < 2) {
    return (
      <p className="rounded-xl border border-dashed border-gray-200/90 bg-gray-50/40 px-4 py-6 text-center text-xs text-gray-500 backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-900/30 dark:text-gray-400">
        {t('gameDetails.fixtureMatrixEmpty')}
      </p>
    );
  }

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl border border-gray-200/70 bg-gradient-to-br from-white via-white to-gray-50/90 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_6px_24px_-10px_rgba(15,23,42,0.08)] ring-1 ring-black/[0.03] dark:border-gray-800/90 dark:from-gray-950 dark:via-gray-950 dark:to-gray-900/95 dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_10px_32px_-14px_rgba(0,0,0,0.5)] dark:ring-white/[0.04] ${fillViewportHeight ? 'flex h-full min-h-0 min-w-0 flex-col' : ''}`}
    >
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-20 w-10 bg-gradient-to-l from-white via-white/80 to-transparent dark:from-gray-950 dark:via-gray-950/70"
        aria-hidden
      />
      <div
        className={`relative z-10 w-full max-w-full overflow-x-auto ${fillViewportHeight ? 'min-h-0 flex-1' : ''}`}
      >
        <div
          className={
            fillViewportHeight
              ? 'h-full min-h-0 max-h-none overflow-y-auto overscroll-y-contain'
              : 'max-h-[min(75vh,720px)] overflow-y-auto overscroll-y-contain'
          }
        >
          <table className="w-max min-w-0 max-w-none border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th
                  scope="col"
                  className={`sticky left-0 top-0 z-[35] border-b border-r border-gray-200/80 bg-gradient-to-b from-gray-50/98 to-gray-100/95 px-2 py-2 text-left align-middle backdrop-blur-md dark:border-gray-700/80 dark:from-gray-900/98 dark:to-gray-950/95 ${stickyTeamShadow}`}
                >
                  <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
                    {t('gameDetails.team')}
                  </span>
                </th>
                {teams.map((col) => (
                  <th
                    key={col.sig}
                    scope="col"
                    className="sticky top-0 z-[28] border-b border-gray-200/70 bg-gradient-to-b from-gray-50/98 to-gray-100/90 px-1.5 py-2 text-center align-middle backdrop-blur-md dark:border-gray-800/80 dark:from-gray-900/98 dark:to-gray-950/90"
                  >
                    <span className="mx-auto flex flex-col items-center justify-center gap-0.5 px-0.5">
                      {col.label.split(' / ').map((segment, i) => (
                        <span
                          key={i}
                          className="text-center text-[10px] font-semibold leading-tight tracking-tight text-gray-800 dark:text-gray-100"
                        >
                          {segment}
                        </span>
                      ))}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teams.map((row, rowIndex) => (
                <tr
                  key={row.sig}
                  className={
                    rowIndex % 2 === 0
                      ? 'bg-white/40 dark:bg-transparent'
                      : 'bg-gray-50/35 dark:bg-gray-900/25'
                  }
                >
                  <th
                    scope="row"
                    className={`sticky left-0 z-[25] border-b border-r border-gray-200/50 bg-white/92 px-2 py-1.5 text-left align-middle backdrop-blur-md dark:border-gray-800/60 dark:bg-gray-950/92 ${stickyTeamShadow}`}
                  >
                    <div className="flex min-h-[40px] flex-col justify-center gap-0.5">
                      {row.players.map((p) => (
                        <div key={p.userId} className="flex items-center gap-1.5">
                          <PlayerAvatar
                            player={(p.user ?? { id: p.userId }) as BasicUser}
                            showName={false}
                            inlineFace
                            extrasmall
                          />
                          <span className="whitespace-nowrap text-xs font-medium tracking-tight text-gray-900 dark:text-gray-50">
                            {formatFixtureMatrixPlayerName(p.user)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </th>
                  {teams.map((col) => {
                    if (row.sig === col.sig) {
                      return (
                        <td
                          key={col.sig}
                          className="border-b border-gray-100/80 bg-gray-100/25 p-1 align-middle dark:border-gray-800/50 dark:bg-gray-800/20"
                          aria-hidden
                        >
                          <div className="flex min-h-[40px] w-full items-center justify-center">
                            <span
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200/60 text-[10px] font-medium text-gray-400 dark:bg-gray-700/50 dark:text-gray-500"
                              aria-hidden
                            >
                              —
                            </span>
                          </div>
                        </td>
                      );
                    }
                    const key = matchupKey(row.sig, col.sig);
                    const cellGames = pairMap.get(key) ?? [];
                    const primary = pickPrimaryGame(cellGames);
                    let outcomeChar: string | null = null;
                    let live = false;
                    if (primary) {
                      const r = rowPerspectiveOutcome(primary, row.sig, col.sig);
                      if (r.outcome) outcomeChar = r.outcome;
                      else if (r.scoreHint === 'live') live = true;
                    }
                    const stacked = cellGames.length > 1;
                    const aria = cellLabel(t, row, col, cellGames, outcomeChar, live);
                    const showScheduleHints =
                      primary != null &&
                      primary.resultsStatus !== 'FINAL' &&
                      !outcomeChar;
                    const scheduleHints = showScheduleHints
                      ? matrixCellScheduleHints(primary, displaySettings)
                      : { dateLine: null as string | null, clubLine: null as string | null };
                    const hasScheduleHints = Boolean(scheduleHints.dateLine || scheduleHints.clubLine);

                    const hintsBlock =
                      hasScheduleHints && (
                        <div className="flex max-w-[5.5rem] flex-col gap-px text-center text-[8px] font-medium leading-tight text-gray-500 dark:text-gray-400">
                          {scheduleHints.dateLine && (
                            <span className="line-clamp-2 break-words">{scheduleHints.dateLine}</span>
                          )}
                          {scheduleHints.clubLine && (
                            <span className="line-clamp-2 break-words">{scheduleHints.clubLine}</span>
                          )}
                        </div>
                      );

                    return (
                      <td
                        key={col.sig}
                        className="border-b border-gray-100/80 p-1 align-middle dark:border-gray-800/50"
                      >
                        <button
                          type="button"
                          aria-label={aria}
                          onClick={(e) => {
                            e.stopPropagation();
                            onFixtureCell({ games: cellGames, row, col });
                          }}
                          className={`relative z-[1] flex min-h-[40px] w-full touch-manipulation flex-col items-center justify-center rounded-xl px-2 py-1 text-center transition-[transform,box-shadow,background-color] duration-200 ease-out ${
                            cellGames.length === 0
                              ? 'cursor-pointer bg-gray-100/40 text-gray-400 hover:bg-gray-100/70 hover:ring-1 hover:ring-gray-200/70 dark:bg-gray-800/25 dark:text-gray-500 dark:hover:bg-gray-800/45 dark:hover:ring-gray-600/40'
                              : 'cursor-pointer bg-white/70 text-gray-900 shadow-sm ring-1 ring-gray-200/60 hover:bg-white hover:shadow-md hover:ring-gray-300/80 active:scale-[0.98] dark:bg-gray-900/40 dark:text-gray-100 dark:ring-gray-700/50 dark:hover:bg-gray-800/70 dark:hover:ring-gray-600/60'
                          }`}
                        >
                          {cellGames.length === 0 && (
                            <span className="text-xs font-medium text-gray-300 dark:text-gray-600">
                              {t('gameDetails.fixtureCellDash')}
                            </span>
                          )}
                          {cellGames.length > 0 && outcomeChar && (
                            <span
                              className={`inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums ${outcomeBadgeClass(outcomeChar)}`}
                            >
                              {outcomeChar}
                            </span>
                          )}
                          {cellGames.length > 0 && !outcomeChar && live && (
                            <div className="flex flex-col items-center justify-center gap-0.5">
                              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500/12 text-orange-600 shadow-[inset_0_0_0_1px_rgba(249,115,22,0.25)] dark:bg-orange-400/10 dark:text-orange-300">
                                <FireOrStatic small />
                              </span>
                              {hintsBlock}
                            </div>
                          )}
                          {cellGames.length > 0 && !outcomeChar && !live && (
                            <>
                              {hasScheduleHints ? (
                                <div className="flex flex-col items-center justify-center">{hintsBlock}</div>
                              ) : (
                                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500">
                                  {t('gameDetails.fixtureCellDash')}
                                </span>
                              )}
                            </>
                          )}
                          {stacked && (
                            <span className="mt-0.5 max-w-full truncate text-[9px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                              {t('gameDetails.fixtureMultipleMatches', { count: cellGames.length - 1 })}
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
