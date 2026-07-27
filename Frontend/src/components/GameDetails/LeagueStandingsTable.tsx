import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import type { LeagueStanding } from '@/api/leagues';
import type { LeagueStandingsColumnFlags } from '@/utils/leagueStandingsColumns';
import {
  formatSignedDelta,
  standingsScoreUnitDelta,
} from '@/utils/leagueStandingsColumns';
import { LeagueStandingsPlaceCell } from './LeagueStandingsPlaceCell';

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
            <th className="text-left py-2 pl-0 pr-0 text-xs font-semibold text-gray-700 dark:text-gray-300">
              <div className="-translate-x-2">
                {hasFixedTeams ? t('gameDetails.team') : t('gameDetails.player')}
              </div>
            </th>
            {columns.showPoints && (
              <th className="text-center py-2 pl-0 pr-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                {t('gameDetails.points')}
              </th>
            )}
            <th className="text-center py-2 pl-4 pr-2 text-xs font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
              {t('gameResults.winsTiesLosses')}
            </th>
            {columns.showSets && (
              <th className="text-center py-2 pl-0 pr-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                {t('gameResults.sets')}
              </th>
            )}
            {columns.showGames && (
              <th className="text-center py-2 px-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                {t('gameResults.extraUnitGames')}
              </th>
            )}
            {columns.showBalls && (
              <th className="text-center py-2 px-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                {t('gameResults.extraUnitBalls')}
              </th>
            )}
            {tieParticipantIds && tieParticipantIds.size > 0 && <th className="w-16" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((standing, index) => {
            const inTie = tieParticipantIds?.has(standing.id) ?? false;
            return (
              <tr
                key={standing.id}
                className={`border-b border-gray-100 dark:border-gray-800 ${
                  inTie
                    ? 'border-l-[3px] border-l-teal-500 bg-teal-50/60 dark:border-l-teal-400 dark:bg-teal-950/25'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <td className="py-2 pl-0 pr-0">
                  <div className="flex items-center justify-center -translate-x-2">
                    <LeagueStandingsPlaceCell index={startIndex + index} />
                  </div>
                </td>
                <td className="py-2 pl-0 pr-0">
                  {hasFixedTeams ? (
                    standing.leagueTeam ? (
                      <div className="flex items-center gap-3 -translate-x-2">
                        <div className="flex -space-x-2">
                          {standing.leagueTeam.players?.slice(0, 3).map((player) => (
                            <PlayerAvatar
                              key={player.id}
                              player={player.user}
                              extrasmall
                              showName={false}
                              fullHideName
                            />
                          ))}
                        </div>
                        <div className="text-sm text-gray-900 dark:text-white">
                          {standing.leagueTeam.players
                            ?.map((p) =>
                              `${p.user?.firstName ?? ''} ${p.user?.lastName ?? ''}`.trim()
                            )
                            .filter(Boolean)
                            .join(', ')}
                        </div>
                      </div>
                    ) : null
                  ) : standing.user ? (
                    <div className="flex items-center gap-3 -translate-x-2">
                      <PlayerAvatar
                        player={standing.user}
                        extrasmall
                        showName={false}
                        fullHideName
                      />
                      <div>
                        <div className="text-sm text-gray-900 dark:text-white">
                          {[standing.user.firstName, standing.user.lastName]
                            .filter(Boolean)
                            .join(' ')}
                        </div>
                        {standing.user.verbalStatus && (
                          <p className="verbal-status">{standing.user.verbalStatus}</p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </td>
                {columns.showPoints && (
                  <td className="py-2 pl-0 pr-2 text-center text-sm font-semibold text-gray-900 dark:text-white">
                    {standing.points}
                  </td>
                )}
                <td className="py-2 pl-4 pr-2 text-center text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  <span>
                    {standing.wins}-{standing.ties}-{standing.losses}
                    <span className="ml-0.5 text-[8px] text-gray-500 dark:text-gray-400">
                      {standing.wins + standing.ties + standing.losses}
                    </span>
                  </span>
                </td>
                {columns.showSets && (
                  <td className="py-2 pl-0 pr-2 text-center text-sm font-semibold text-gray-900 dark:text-white">
                    {formatSignedDelta(standing.setDelta ?? 0)}
                  </td>
                )}
                {columns.showGames && (
                  <td className="py-2 px-2 text-center text-sm text-gray-700 dark:text-gray-300">
                    {formatSignedDelta(standingsScoreUnitDelta(standing))}
                  </td>
                )}
                {columns.showBalls && (
                  <td className="py-2 px-2 text-center text-sm text-gray-700 dark:text-gray-300">
                    {formatSignedDelta(standingsScoreUnitDelta(standing))}
                  </td>
                )}
                {tieParticipantIds && tieParticipantIds.size > 0 && (
                  <td className="py-2 pr-2 text-right">
                    {inTie ? (
                      <button
                        type="button"
                        onClick={() => jumpToTie(standing.id)}
                        aria-label={t('gameDetails.standingsSeeWhyAria', {
                          defaultValue: 'See why this place was decided',
                        })}
                        className="inline-flex min-h-8 items-center rounded-full bg-teal-600/10 px-2.5 text-[11px] font-semibold text-teal-800 transition hover:bg-teal-600/20 dark:bg-teal-400/10 dark:text-teal-200 dark:hover:bg-teal-400/20"
                      >
                        {t('gameDetails.standingsSeeWhy')}
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
