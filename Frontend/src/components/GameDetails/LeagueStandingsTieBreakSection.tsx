import { useTranslation } from 'react-i18next';
import type { LeagueStanding, LeagueStandingsTieCluster } from '@/api/leagues';
import type { LeagueStandingsColumnFlags } from '@/utils/leagueStandingsColumns';
import { standingsTieClusterAnchorId } from '@/utils/leagueStandingsTieExplain';
import { LeagueStandingsMiniTable } from './LeagueStandingsMiniTable';

type Props = {
  groupKey: string;
  clusters: LeagueStandingsTieCluster[];
  standingsById: Map<string, LeagueStanding>;
  hasFixedTeams: boolean;
  columns: LeagueStandingsColumnFlags;
};

export function LeagueStandingsTieBreakSection({
  groupKey,
  clusters,
  standingsById,
  hasFixedTeams,
  columns,
}: Props) {
  const { t } = useTranslation();
  if (clusters.length === 0) return null;

  return (
    <div className="space-y-3 border-t border-dashed border-gray-200 bg-gray-50/40 px-3 py-4 dark:border-gray-700 dark:bg-gray-950/20">
      <div className="px-1">
        <h3 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-white">
          {t('gameDetails.standingsTieBreakSectionTitle')}
        </h3>
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          {t('gameDetails.standingsTieBreakSectionHint')}
        </p>
      </div>
      <div className="space-y-3">
        {clusters.map((cluster) => (
          <LeagueStandingsMiniTable
            key={`${groupKey}-${cluster.seasonWins}-${cluster.rows
              .map((r) => r.participantId)
              .join(',')}`}
            cluster={cluster}
            standingsById={standingsById}
            hasFixedTeams={hasFixedTeams}
            columns={columns}
            anchorId={standingsTieClusterAnchorId(groupKey, cluster.seasonWins)}
          />
        ))}
      </div>
    </div>
  );
}
