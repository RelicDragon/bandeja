import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { usersApi, UserStats } from '@/api/users';
import { Loading } from './Loading';
import { LevelHistoryView } from './LevelHistoryView';
import { GamesStatsSection } from './GamesStatsSection';
import { useAuthStore } from '@/store/authStore';
import { Beer } from 'lucide-react';

const TennisBallIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 69.447 69.447"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g transform="translate(-1271.769 -1574.648)">
      <path d="M1341.208,1609.372a34.719,34.719,0,1,1-34.72-34.724A34.724,34.724,0,0,1,1341.208,1609.372Z" fill="#b9d613"/>
      <path d="M1311.144,1574.993a35.139,35.139,0,0,0-4.61-.344,41.069,41.069,0,0,1-34.369,29.735,34.3,34.3,0,0,0-.381,4.635l.183-.026a45.921,45.921,0,0,0,39.149-33.881Zm29.721,34.692a45.487,45.487,0,0,0-33.488,34.054l-.071.313a34.54,34.54,0,0,0,4.818-.455,41.218,41.218,0,0,1,28.686-29.194,36.059,36.059,0,0,0,.388-4.8Z" fill="#f7f7f7"/>
    </g>
  </svg>
);

export const ProfileStatistics = () => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [gamesStatsTab, setGamesStatsTab] = useState<'30' | '90' | 'all'>('30');
  const [showSocialLevel, setShowSocialLevel] = useState(false);
  const [isToggleAnimating, setIsToggleAnimating] = useState(false);

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

  const { user: userData } = stats;
  const initials = `${userData.firstName?.[0] || ''}${userData.lastName?.[0] || ''}`.toUpperCase();

  const handleToggle = () => {
    setIsToggleAnimating(true);
    setShowSocialLevel(!showSocialLevel);
    setTimeout(() => setIsToggleAnimating(false), 200);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.3 }}
      className="space-y-6"
    >
      <div className="relative">
        <div className="bg-gradient-to-br from-primary-500 to-primary-700 dark:from-primary-600 dark:to-primary-800 rounded-2xl p-4 text-center relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2">
            {userData.originalAvatar ? (
              <button
                className="cursor-pointer hover:opacity-90 transition-opacity"
              >
                {userData.avatar ? (
                  <img
                    src={userData.avatar || ''}
                    alt={`${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'User'}
                    className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-xl"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-4xl border-4 border-white dark:border-gray-800 shadow-xl">
                    {initials}
                  </div>
                )}
              </button>
            ) : userData.avatar ? (
              <img
                src={userData.avatar || ''}
                alt={`${userData.firstName} ${userData.lastName}`}
                className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-xl"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-4xl border-4 border-white dark:border-gray-800 shadow-xl">
                {initials}
              </div>
            )}
          </div>
          <div className="text-white text-sm mb-1">
            {showSocialLevel ? t('rating.socialLevel') : t('playerCard.currentLevel')}
          </div>
          <div className="text-white text-6xl font-bold pb-6">
            {showSocialLevel ? userData.socialLevel.toFixed(2) : userData.level.toFixed(2)}
          </div>
          {!showSocialLevel && (
            <div className="absolute bottom-3 right-3 text-white/80 text-xs">
              {t('rating.reliability')}: {userData.reliability.toFixed(0)}%
            </div>
          )}
        </div>
        <button
          onClick={handleToggle}
          className="absolute top-3 right-3 w-8 h-8 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-md hover:shadow-lg transition-transform duration-200 flex items-center justify-center"
          style={{ transform: isToggleAnimating ? 'scale(1.3)' : 'scale(1)' }}
          title={showSocialLevel ? t('playerCard.switchToLevel') : t('playerCard.switchToSocialLevel')}
        >
          {showSocialLevel ? (
            <TennisBallIcon />
          ) : (
            <Beer size={20} className="text-amber-600" />
          )}
        </button>
      </div>

      <GamesStatsSection
        stats={stats.gamesStats}
        activeTab={gamesStatsTab}
        onTabChange={setGamesStatsTab}
      />

      <LevelHistoryView stats={stats} padding="p-0" hideUserCard={true} />
    </motion.div>
  );
};

