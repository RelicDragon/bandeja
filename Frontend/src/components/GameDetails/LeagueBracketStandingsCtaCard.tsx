import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { Card } from '@/components';
import { buildLeagueBracketSchedulePath } from '@/utils/leagueBracketScheduleDeepLink.util';
import type { BracketScope } from '@/api/leagues';

interface LeagueBracketStandingsCtaCardProps {
  leagueSeasonId: string;
  bracketRoundId?: string;
  groupId?: string | null;
  bracketScope?: BracketScope;
  crossGroupBracket?: boolean;
}

export function LeagueBracketStandingsCtaCard({
  leagueSeasonId,
  bracketRoundId,
  groupId,
  bracketScope = 'PER_GROUP',
  crossGroupBracket = false,
}: LeagueBracketStandingsCtaCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
          <LayoutGrid size={18} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {crossGroupBracket
              ? t('gameDetails.bracketPodiumSeasonTitle')
              : t('gameDetails.bracketPodiumTitle')}
          </p>
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
            {t('home.leagueBracketStandingsCtaHint', {
              defaultValue: 'Follow the bracket as playoffs progress.',
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            navigate(
              buildLeagueBracketSchedulePath(leagueSeasonId, {
                roundId: bracketRoundId,
                groupId: crossGroupBracket ? undefined : groupId,
                bracketScope: crossGroupBracket ? 'CROSS_GROUP' : bracketScope,
              })
            )
          }
          className="shrink-0 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
        >
          {t('gameDetails.bracketViewFullBracket')}
        </button>
      </div>
    </Card>
  );
}
