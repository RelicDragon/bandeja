import { useTranslation } from 'react-i18next';
import { shimmerBlock } from '@/components/motion/shimmerBlock';

const PODIUM_HEIGHTS = [124, 108, 96];
const ROW_COUNT = 6;

/**
 * Loading state for the Pairs tab: the podium's three blocks plus row
 * skeletons, so the list does not jump when the real data lands.
 */
export const PairLeaderboardSkeleton = () => {
  const { t } = useTranslation();

  return (
    <div
      className="space-y-3"
      role="status"
      aria-busy="true"
      aria-label={t('pairs.loading')}
      data-testid="pair-leaderboard-skeleton"
    >
      <div className="flex items-end justify-center gap-2" aria-hidden>
        {PODIUM_HEIGHTS.map((height) => (
          <div key={height} className={`${shimmerBlock} flex-1 rounded-2xl`} style={{ height }} />
        ))}
      </div>
      <div className="space-y-2" aria-hidden>
        {Array.from({ length: ROW_COUNT }, (_, index) => (
          <div key={index} className="flex items-center gap-2.5 px-2 py-2">
            <div className={`${shimmerBlock} h-4 w-5 rounded`} />
            <div className={`${shimmerBlock} h-10 w-14 rounded-full`} />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className={`${shimmerBlock} h-3.5 w-2/5 rounded`} />
              <div className={`${shimmerBlock} h-3 w-1/3 rounded`} />
            </div>
            <div className={`${shimmerBlock} h-7 w-12 rounded-full`} />
          </div>
        ))}
      </div>
    </div>
  );
};
