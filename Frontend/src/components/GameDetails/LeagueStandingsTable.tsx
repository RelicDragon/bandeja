import { useTranslation } from 'react-i18next';
import { HelpCircle } from 'lucide-react';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import type { LeagueStanding } from '@/api/leagues';
import type { LeagueStandingsColumnFlags } from '@/utils/leagueStandingsColumns';
import {
  formatSignedDelta,
  standingsScoreUnitDelta,
} from '@/utils/leagueStandingsColumns';
import { formatFixtureMatrixPlayerName } from '@/utils/leagueFixtureMatrix';
import { LeagueStandingsPlaceCell } from './LeagueStandingsPlaceCell';
import { LeagueStandingsTeamPlayersCell } from './LeagueStandingsTeamPlayersCell';

type Props = {
  rows: LeagueStanding[];
  startIndex?: number;
  hasFixedTeams: boolean;
  columns: LeagueStandingsColumnFlags;
  /** Participant ids in an equal-wins tie cluster (for highlight + jump). */
  tieParticipantIds?: Set<string>;
  /** participantId → mini-table anchor id */
  tieAnchorByParticipantId?: Map<string, string>;
};

export function LeagueStandingsTable({
  rows,
  startIndex = 0,
  hasFixedTeams,
  columns,
  tieParticipantIds,
  tieAnchorByParticipantId,
}: Props) {
  const { t } = useTranslation();

  const jumpToTie = (participantId: string) => {
    const anchor = tieAnchorByParticipantId?.get(participantId);
    if (!anchor) return;
    document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="w-14" />
            <th className="py-2 ps-0 pe-0 text-start text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <div className="-translate-x-2">
                {hasFixedTeams ? t('gameDetails.team') : t('gameDetails.player')}
              </div>
            </th>
            {columns.showPoints && (
              <th className="py-2 ps-0 pe-2 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t('gameDetails.points')}
              </th>
            )}
            <th className="whitespace-nowrap py-2 ps-4 pe-2 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t('gameResults.winsTiesLosses')}
            </th>
            {columns.showGames && (
              <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t('gameResults.extraUnitGames')}
              </th>
            )}
            {columns.showBalls && (
              <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t('gameResults.extraUnitBalls')}
              </th>
            )}
            {tieParticipantIds && tieParticipantIds.size > 0 && <th className="w-10" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((standing, index) => {
            const inTie = tieParticipantIds?.has(standing.id) ?? false;
            const withdrawn = Boolean(standing.withdrawnAt);
            const activePlaceIndex = withdrawn
              ? 0
              : startIndex +
                rows.slice(0, index).filter((r) => !r.withdrawnAt).length;
            return (
              <tr
                key={standing.id}
                className={`border-b border-gray-100 dark:border-gray-800 ${
                  withdrawn
                    ? 'opacity-55 grayscale'
                    : inTie
                      ? 'border-s-[3px] border-s-teal-500 bg-teal-50/60 dark:border-s-teal-400 dark:bg-teal-950/25'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <td className="py-2 ps-0 pe-0">
                  <div className="flex items-center justify-center -translate-x-2">
                    <LeagueStandingsPlaceCell index={activePlaceIndex} withdrawn={withdrawn} />
                  </div>
                </td>
                <td className="py-2 ps-0 pe-0">
                  {hasFixedTeams ? (
                    standing.leagueTeam ? (
                      <div className="-translate-x-2">
                        <LeagueStandingsTeamPlayersCell players={standing.leagueTeam.players} />
                      </div>
                    ) : null
                  ) : standing.user ? (
                    <div className="-translate-x-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <PlayerAvatar
                          player={standing.user}
                          showName={false}
                          fullHideName
                          inlineFace
                          inlineFacePlain
                          inlineFaceSize="sm"
                          subscribePresence={false}
                          asDiv
                        />
                        <div className="min-w-0">
                          <div className="truncate text-xs leading-tight text-gray-900 dark:text-white">
                            {formatFixtureMatrixPlayerName(standing.user) || '—'}
                          </div>
                          {standing.user.verbalStatus && (
                            <p className="verbal-status">{standing.user.verbalStatus}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </td>
                {columns.showPoints && (
                  <td className="py-2 ps-0 pe-2 text-center text-xs font-semibold text-gray-900 dark:text-white">
                    {standing.points}
                  </td>
                )}
                <td className="whitespace-nowrap py-2 ps-4 pe-2 text-center text-xs text-gray-700 dark:text-gray-300">
                  <span>
                    {standing.wins}-{standing.ties}-{standing.losses}
                    <span className="ms-0.5 text-[8px] text-gray-500 dark:text-gray-400">
                      {standing.wins + standing.ties + standing.losses}
                    </span>
                  </span>
                </td>
                {columns.showGames && (
                  <td className="px-2 py-2 text-center text-xs text-gray-700 dark:text-gray-300">
                    {formatSignedDelta(standingsScoreUnitDelta(standing))}
                  </td>
                )}
                {columns.showBalls && (
                  <td className="px-2 py-2 text-center text-xs text-gray-700 dark:text-gray-300">
                    {formatSignedDelta(standingsScoreUnitDelta(standing))}
                  </td>
                )}
                {tieParticipantIds && tieParticipantIds.size > 0 && (
                  <td className="py-2 pe-1 text-end">
                    {inTie ? (
                      <button
                        type="button"
                        onClick={() => jumpToTie(standing.id)}
                        aria-label={t('gameDetails.standingsSeeWhyAria')}
                        title={t('gameDetails.standingsSeeWhyAria')}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-teal-600/10 text-teal-800 transition hover:bg-teal-600/20 dark:bg-teal-400/10 dark:text-teal-200 dark:hover:bg-teal-400/20"
                      >
                        <HelpCircle className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                      </button>
                    ) : null}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
