import { useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import type { UserStats } from '@/api/users';
import { Loading } from './Loading';
import { LevelHistoryView } from './LevelHistoryView';
import { ProfileWorkoutHealthSection } from './ProfileWorkoutHealthSection';
import { useAuthStore } from '@/store/authStore';
import { getUserPrimarySport, resolveActivePrimarySport } from '@/utils/profileSports';
import { queryKeys } from '@/queries/queryKeys';
import { useUserStatsQuery } from '@/queries/useUserStatsQuery';

export const ProfileStatistics = () => {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const sport = useMemo(
    () => (user ? resolveActivePrimarySport(user) ?? getUserPrimarySport(user) : undefined),
    [user],
  );
  const { data: stats, isPending } = useUserStatsQuery(user?.id, sport);
  const loading = isPending && !stats;

  const setStats = useCallback(
    (nextStats: UserStats) => {
      if (!user?.id) return;
      queryClient.setQueryData(queryKeys.userStats(user.id, sport), nextStats);
    },
    [queryClient, user?.id, sport],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loading />
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.3 }}
      className="space-y-6"
    >
      <LevelHistoryView stats={stats} padding="p-0" onStatsRefresh={setStats} />
      <ProfileWorkoutHealthSection />
    </motion.div>
  );
};
