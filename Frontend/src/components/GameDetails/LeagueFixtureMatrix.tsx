import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Flame } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { LeagueRound } from '@/api/leagues';
import type { MatrixTeam } from '@/utils/leagueFixtureMatrix';
import type { BasicUser, Game } from '@/types';
import { PlayerAvatar } from '@/components';
import { AnnouncedFireIcon } from '@/components/AnnouncedFireIcon';
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
  onOpenGames: (games: Game[]) => void;
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
    return <Flame className={small ? 'h-4 w-4 text-orange-500' : 'h-5 w-5 text-orange-500'} aria-hidden />;
  }
  return <AnnouncedFireIcon className={small ? '[&>canvas]:max-w-4 [&>canvas]:max-h-4' : ''} />;
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

export const LeagueFixtureMatrix = ({
  groupId,
  teams,
  rounds,
  onOpenGames,
}: LeagueFixtureMatrixProps) => {
  const { t } = useTranslation();

  const pairMap = useMemo(() => buildPairCellMap(rounds, groupId), [rounds, groupId]);

  if (teams.length < 2) {
    return (
      <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        {t('gameDetails.fixtureMatrixEmpty')}
      </p>
    );
  }

  return (
    <div className="relative rounded-2xl border border-gray-200/90 bg-white/90 shadow-sm dark:border-gray-700 dark:bg-gray-900/80">
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-20 w-8 bg-gradient-to-l from-white to-transparent dark:from-gray-900"
        aria-hidden
      />
      <div
        className="relative z-10 max-w-full overflow-x-auto overflow-y-auto overscroll-x-contain rounded-2xl"
        style={{ maxHeight: 'min(70vh, 640px)' }}
      >
        <table className="min-w-max border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-[35] min-w-[140px] bg-gray-50/95 px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 backdrop-blur-sm dark:bg-gray-950/95 dark:text-gray-400 border-b border-r border-gray-200 dark:border-gray-800"
              >
                {t('gameDetails.team')}
              </th>
              {teams.map((col) => (
                <th
                  key={col.sig}
                  scope="col"
                  className="sticky top-0 z-[28] min-w-[72px] max-w-[132px] border-b border-gray-200 bg-gray-50/95 px-1 py-2 text-center text-[11px] font-medium text-gray-600 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-950/95 dark:text-gray-300"
                >
                  <span className="flex flex-col gap-0.5 leading-snug">
                    {col.label.split(' / ').map((segment, i) => (
                      <span key={i} className="line-clamp-2 break-words">
                        {segment}
                      </span>
                    ))}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((row) => (
              <tr key={row.sig}>
                    <th
                      scope="row"
                      className="sticky left-0 z-[25] min-w-[140px] border-b border-r border-gray-100 bg-white/95 px-2 py-1.5 text-left backdrop-blur-sm dark:border-gray-800 dark:bg-gray-950/95"
                    >
                      <div className="flex flex-col gap-1">
                        {row.players.map((p) => (
                          <div key={p.userId} className="flex min-w-0 items-center gap-1.5">
                            <PlayerAvatar
                              player={(p.user ?? { id: p.userId }) as BasicUser}
                              showName={false}
                              inlineFace
                              extrasmall
                            />
                            <span className="min-w-0 truncate text-xs font-medium text-gray-900 dark:text-white">
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
                            className="border-b border-gray-100 bg-gray-50/50 text-center align-middle dark:border-gray-800"
                            aria-hidden
                          >
                            <span className="text-gray-300 dark:text-gray-600">·</span>
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

                      return (
                        <td key={col.sig} className="border-b border-gray-100 p-0.5 dark:border-gray-800">
                          <button
                            type="button"
                            disabled={cellGames.length === 0}
                            aria-label={aria}
                            onClick={() => cellGames.length && onOpenGames(cellGames)}
                            className={`flex h-11 min-h-[44px] w-full min-w-[48px] flex-col items-center justify-center rounded-lg text-xs font-semibold transition
                              ${
                                cellGames.length === 0
                                  ? 'cursor-default text-gray-300 dark:text-gray-600'
                                  : 'cursor-pointer text-gray-800 hover:bg-primary-50 active:scale-[0.97] dark:text-gray-100 dark:hover:bg-primary-950/40'
                              }`}
                          >
                            {cellGames.length === 0 && (
                              <span className="text-gray-300 dark:text-gray-600">{t('gameDetails.fixtureCellDash')}</span>
                            )}
                            {cellGames.length > 0 && outcomeChar && (
                              <span
                                className={
                                  outcomeChar === 'W'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : outcomeChar === 'L'
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-amber-600 dark:text-amber-400'
                                }
                              >
                                {outcomeChar}
                              </span>
                            )}
                            {cellGames.length > 0 && !outcomeChar && live && <FireOrStatic small />}
                            {cellGames.length > 0 && !outcomeChar && !live && (
                              <span className="text-gray-400">{t('gameDetails.fixtureCellDash')}</span>
                            )}
                            {stacked && (
                              <span className="mt-0.5 text-[10px] font-normal text-gray-500">
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
  );
};
