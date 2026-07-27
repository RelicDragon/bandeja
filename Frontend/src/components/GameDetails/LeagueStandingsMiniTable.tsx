import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { GitCompareArrows } from 'lucide-react';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import type { LeagueStanding, LeagueStandingsTieCluster } from '@/api/leagues';
import type { LeagueStandingsColumnFlags } from '@/utils/leagueStandingsColumns';
import { formatSignedDelta } from '@/utils/leagueStandingsColumns';
import {
  explainStandingsTieStep,
  standingsTieClusterKind,
  type StandingsTieDecideBy,
} from '@/utils/leagueStandingsTieExplain';
import { LeagueStandingsTeamPlayersCell } from './LeagueStandingsTeamPlayersCell';

type Props = {
  cluster: LeagueStandingsTieCluster;
  standingsById: Map<string, LeagueStanding>;
  hasFixedTeams: boolean;
  columns: LeagueStandingsColumnFlags;
  anchorId: string;
};

function decideLabel(
  by: StandingsTieDecideBy,
  scoreUnitLabel: string,
  t: TFunction
): string {
  switch (by) {
    case 'h2h':
      return t('gameDetails.standingsTieReasonH2h');
    case 'miniWins':
      return t('gameDetails.standingsTieReasonMiniWins');
    case 'setDiff':
      return t('gameDetails.standingsTieReasonSets');
    case 'gameDiff':
      return t('gameDetails.standingsTieReasonScoreUnit', { unit: scoreUnitLabel });
    default:
      return t('gameDetails.standingsTieReasonStable');
  }
}

function metricClass(active: boolean): string {
  return active
    ? 'rounded-md bg-teal-600/15 px-1.5 py-0.5 font-semibold text-teal-800 dark:bg-teal-400/15 dark:text-teal-200'
    : 'text-gray-700 dark:text-gray-300';
}

function ParticipantCell({
  standing,
  hasFixedTeams,
}: {
  standing: LeagueStanding | undefined;
  hasFixedTeams: boolean;
}) {
  if (hasFixedTeams && standing?.leagueTeam) {
    return <LeagueStandingsTeamPlayersCell players={standing.leagueTeam.players} />;
  }
  if (standing?.user) {
    const name =
      [standing.user.firstName, standing.user.lastName].filter(Boolean).join(' ') || '—';
    return (
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
        <span className="min-w-0 truncate text-xs leading-tight text-gray-900 dark:text-white">
          {name}
        </span>
      </div>
    );
  }
  return <span className="text-sm text-gray-500">—</span>;
}

export function LeagueStandingsMiniTable({
  cluster,
  standingsById,
  hasFixedTeams,
  columns,
  anchorId,
}: Props) {
  const { t } = useTranslation();
  const kind = standingsTieClusterKind(cluster.rows.length);
  const showScoreUnits = kind === 'mini';
  const scoreUnitLabel = columns.showGames
    ? t('gameResults.extraUnitGames')
    : t('gameResults.extraUnitBalls');

  const stepByRow = cluster.rows.map((row, index) => {
    const next = cluster.rows[index + 1];
    if (!next) return null;
    return explainStandingsTieStep(row, next, kind);
  });

  return (
    <section
      id={anchorId}
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-teal-200/80 bg-white shadow-sm dark:border-teal-900/45 dark:bg-gray-900/50"
    >
      <header className="flex items-start gap-3 border-b border-teal-100/90 bg-gradient-to-r from-teal-50/90 to-transparent px-4 py-3.5 dark:border-teal-900/40 dark:from-teal-950/35">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm shadow-teal-600/20">
          <GitCompareArrows className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
              {t('gameDetails.standingsMiniTableTitle', {
                wins: cluster.seasonWins,
                count: cluster.rows.length,
              })}
            </h4>
            <span className="rounded-full bg-teal-600/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-800 dark:bg-teal-400/10 dark:text-teal-200">
              {kind === 'h2h'
                ? t('gameDetails.standingsMiniKindH2h')
                : t('gameDetails.standingsMiniKindMini')}
            </span>
          </div>
          <p className="mt-1 text-xs leading-snug text-gray-600 dark:text-gray-400">
            {kind === 'h2h'
              ? t('gameDetails.standingsMiniSubtitleH2h')
              : t('gameDetails.standingsMiniSubtitleMini')}
          </p>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[280px]">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              <th className="w-9 px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400" />
              <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {hasFixedTeams ? t('gameDetails.team') : t('gameDetails.player')}
              </th>
              <th className="px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {kind === 'h2h' ? t('gameDetails.standingsMiniWinsH2h') : t('gameDetails.standingsMiniWins')}
              </th>
              {showScoreUnits && (
                <>
                  <th className="px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t('gameResults.sets')}
                  </th>
                  <th className="px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {scoreUnitLabel}
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {cluster.rows.map((row, index) => {
              const standing = standingsById.get(row.participantId);
              const decideBy = stepByRow[index];
              const highlightWins = decideBy === 'h2h' || decideBy === 'miniWins';
              const highlightSets = decideBy === 'setDiff';
              const highlightGames = decideBy === 'gameDiff';

              return (
                <tr
                  key={row.participantId}
                  className="border-b border-gray-50 last:border-0 dark:border-gray-800/70"
                >
                  <td className="px-2 py-3 text-center align-top text-xs font-semibold text-gray-400">
                    {index + 1}
                  </td>
                  <td className="px-2 py-3 align-top">
                    <ParticipantCell standing={standing} hasFixedTeams={hasFixedTeams} />
                    {decideBy ? (
                      <p className="mt-1.5 text-[11px] font-medium text-teal-700 dark:text-teal-300">
                        {decideLabel(decideBy, scoreUnitLabel, t)}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-2 py-3 text-center align-top text-sm">
                    <span className={metricClass(highlightWins)}>{row.miniWins}</span>
                  </td>
                  {showScoreUnits && (
                    <>
                      <td className="px-2 py-3 text-center align-top text-sm">
                        <span className={metricClass(highlightSets)}>
                          {formatSignedDelta(row.setDiff)}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-center align-top text-sm">
                        <span className={metricClass(highlightGames)}>
                          {formatSignedDelta(row.gameDiff)}
                        </span>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
