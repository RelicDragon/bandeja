import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { pairsApi } from '@/api/pairs';
import { queryKeys } from '@/queries/queryKeys';
import { shimmerBlock } from '@/components/motion/shimmerBlock';
import type { Sport } from '@/types';
import { PairStatTiles } from './PairStatTiles';

export interface UserTeamPairStatsProps {
  userAId: string | null | undefined;
  userBId: string | null | undefined;
  sport?: Sport;
}

/**
 * PRD 352 — the pair stat band at the top of `/user-team/:id`.
 *
 * The same Games · Win rate · Chemistry tiles as the ad-hoc pair sheet, so a
 * formal team and an informal duo report identical numbers. Renders nothing
 * until the team actually has two members, and nothing at all when they have
 * never played together — an all-zero band would just be noise.
 */
export const UserTeamPairStats = ({ userAId, userBId, sport }: UserTeamPairStatsProps) => {
  const { t } = useTranslation();
  const pairId =
    userAId && userBId && userAId !== userBId
      ? [userAId, userBId].sort().join(',')
      : null;

  const query = useQuery({
    queryKey: queryKeys.pairs.detail(pairId ?? '', sport),
    queryFn: () => pairsApi.getPair(pairId!, sport),
    enabled: Boolean(pairId),
    staleTime: 60 * 1000,
  });

  if (!pairId) return null;

  if (query.isLoading) {
    return (
      <div
        className={`${shimmerBlock} h-[4.5rem] w-full rounded-2xl`}
        role="status"
        aria-label={t('pairs.loading')}
      />
    );
  }

  const detail = query.data;
  if (!detail || detail.games === 0) return null;

  return (
    <PairStatTiles
      games={detail.games}
      winRate={detail.winRate}
      chemistry={detail.chemistry}
    />
  );
};
