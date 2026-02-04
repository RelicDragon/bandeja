import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { usersApi, UserStats } from '@/api/users';
import { Loading } from './Loading';
import { LevelHistoryView } from './LevelHistoryView';
import { useAuthStore } from '@/store/authStore';

export const ProfileStatistics = () => {
  const user = useAuthStore((state) => state.user);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;

    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await usersApi.getUserStats(user.id);
        setStats(response.data);
      } catch (error) {
        console.error('Failed to fetch user stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [user?.id]);

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
      <LevelHistoryView stats={stats} padding="p-0" />
    </motion.div>
  );
};

