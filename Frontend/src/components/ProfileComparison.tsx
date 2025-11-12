import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Search, Users, Swords } from 'lucide-react';
import { usersApi, PlayerComparison } from '@/api/users';
import { Game } from '@/types';
import { Loading } from './Loading';
import { PlayerListModal } from './PlayerListModal';
import { CachedImage } from './CachedImage';
import { ComparisonTabController } from './ComparisonTabController';
import { GameCard } from './GameCard';
import { UrlConstructor } from '@/utils/urlConstructor';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';

export const ProfileComparison = () => {
  const { t } = useTranslation();
  const currentUser = useAuthStore((state) => state.user);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [comparison, setComparison] = useState<PlayerComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'stats' | 'games' | 'more'>('stats');

  const handlePlayerSelect = async (playerIds: string[]) => {
    if (playerIds.length === 0) return;
    
    const playerId = playerIds[0];
    setSelectedPlayerId(playerId);
    setShowPlayerModal(false);
    
    try {
      setLoading(true);
      const response = await usersApi.getPlayerComparison(playerId);
      setComparison(response.data);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
      setComparison(null);
    } finally {
      setLoading(false);
    }
  };

  const selectedPlayer = comparison?.otherUser;

  return (
    <div className="space-y-6">
      {!selectedPlayer && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPlayerModal(true)}
            className="flex-1 flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer border-2 border-dashed border-gray-300 dark:border-gray-600"
          >
            <Search size={20} className="text-gray-400 dark:text-gray-500" />
            <span className="text-gray-600 dark:text-gray-400">
              {t('profile.selectPlayerToCompare') || 'Select player to compare'}
            </span>
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-64">
          <Loading />
        </div>
      )}

      {!loading && comparison && selectedPlayer && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          <div className="bg-gradient-to-br from-primary-500 to-primary-700 dark:from-primary-600 dark:to-primary-800 rounded-2xl p-6 pb-2">
            <div className="flex items-center justify-center gap-6 mb-4">
              <div className="text-center">
                <div className="mb-2">
                  {currentUser?.avatar ? (
                    <CachedImage
                      src={UrlConstructor.constructImageUrl(currentUser.avatar)}
                      alt={`${currentUser.firstName} ${currentUser.lastName}`}
                      className="w-16 h-16 rounded-full object-cover border-2 border-white dark:border-gray-800 shadow-lg mx-auto"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-2xl border-2 border-white dark:border-gray-800 shadow-lg mx-auto">
                      {`${currentUser?.firstName?.[0] || ''}${currentUser?.lastName?.[0] || ''}`.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="text-white text-sm font-semibold">
                  {currentUser?.firstName} {currentUser?.lastName}
                </div>
              </div>
              
              <div className="text-white text-2xl font-bold">VS</div>
              
              <div className="text-center">
                <button
                  onClick={() => setShowPlayerModal(true)}
                  className="mb-2 cursor-pointer hover:opacity-90 transition-opacity"
                >
                  {selectedPlayer.avatar ? (
                    <CachedImage
                      src={UrlConstructor.constructImageUrl(selectedPlayer.avatar)}
                      alt={`${selectedPlayer.firstName} ${selectedPlayer.lastName}`}
                      className="w-16 h-16 rounded-full object-cover border-2 border-white dark:border-gray-800 shadow-lg mx-auto"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-2xl border-2 border-white dark:border-gray-800 shadow-lg mx-auto">
                    {`${selectedPlayer.firstName?.[0] || ''}${selectedPlayer.lastName?.[0] || ''}`.toUpperCase()}
                  </div>
                  )}
                </button>
                <div className="text-white text-sm font-semibold">
                  {selectedPlayer.firstName} {selectedPlayer.lastName}
                </div>
              </div>
            </div>
          </div>

          <ComparisonTabController activeTab={activeTab} onTabChange={setActiveTab} />

          {activeTab === 'stats' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Users size={20} className="text-primary-600 dark:text-primary-400" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {t('profile.gamesTogether') || 'Games Together'}
                  </h3>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">
                      {t('profile.total')}
                    </span>
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {comparison.gamesTogether.total}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">
                      {t('playerCard.gamesWon')}
                    </span>
                    <span className="text-xl font-semibold text-green-600 dark:text-green-400">
                      {comparison.gamesTogether.wins}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">
                      {t('playerCard.gamesLost') || 'Losses'}
                    </span>
                    <span className="text-xl font-semibold text-red-600 dark:text-red-400">
                      {comparison.gamesTogether.losses}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-600">
                    <span className="text-gray-600 dark:text-gray-400">
                      {t('playerCard.winRate')}
                    </span>
                    <span className="text-xl font-bold text-gray-900 dark:text-white">
                      {comparison.gamesTogether.winRate}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Swords size={20} className="text-primary-600 dark:text-primary-400" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {t('profile.gamesAgainst') || 'Games Against'}
                  </h3>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">
                      {t('profile.total')}
                    </span>
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {comparison.gamesAgainst.total}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">
                      {t('playerCard.gamesWon')}
                    </span>
                    <span className="text-xl font-semibold text-green-600 dark:text-green-400">
                      {comparison.gamesAgainst.wins}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">
                      {t('playerCard.gamesLost') || 'Losses'}
                    </span>
                    <span className="text-xl font-semibold text-red-600 dark:text-red-400">
                      {comparison.gamesAgainst.losses}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-600">
                    <span className="text-gray-600 dark:text-gray-400">
                      {t('playerCard.winRate')}
                    </span>
                    <span className="text-xl font-bold text-gray-900 dark:text-white">
                      {comparison.gamesAgainst.winRate}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'games' && (
            <div className="space-y-4">
              {comparison.gamesAgainstEachOther && comparison.gamesAgainstEachOther.length > 0 ? (
                comparison.gamesAgainstEachOther.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game as unknown as Game}
                    user={currentUser}
                    isInitiallyCollapsed={true}
                  />
                ))
              ) : (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  {t('profile.noGamesAgainstEachOther') || 'No games where both players participated against each other'}
                </div>
              )}
            </div>
          )}

          {activeTab === 'more' && comparison.currentUserStats && comparison.otherUserStats && (
            <div className="space-y-6">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl px-6 py-3">
                <div className="grid grid-cols-3 gap-4 items-center">
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${
                      comparison.currentUserStats.totalGames > comparison.otherUserStats.totalGames
                        ? 'text-green-600 dark:text-green-400'
                        : comparison.currentUserStats.totalGames < comparison.otherUserStats.totalGames
                        ? 'text-gray-500 dark:text-gray-500'
                        : 'text-gray-900 dark:text-white'
                    }`}>
                      {comparison.currentUserStats.totalGames}
                    </div>
                  </div>
                  <div className="text-center text-sm font-semibold text-gray-600 dark:text-gray-400">
                    {t('profile.totalGames')}
                  </div>
                  <div className="text-left">
                    <div className={`text-2xl font-bold ${
                      comparison.otherUserStats.totalGames > comparison.currentUserStats.totalGames
                        ? 'text-green-600 dark:text-green-400'
                        : comparison.otherUserStats.totalGames < comparison.currentUserStats.totalGames
                        ? 'text-gray-500 dark:text-gray-500'
                        : 'text-gray-900 dark:text-white'
                    }`}>
                      {comparison.otherUserStats.totalGames}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl px-6 py-3">
                <div className="grid grid-cols-3 gap-4 items-center">
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${
                      comparison.currentUserStats.totalMatches > comparison.otherUserStats.totalMatches
                        ? 'text-green-600 dark:text-green-400'
                        : comparison.currentUserStats.totalMatches < comparison.otherUserStats.totalMatches
                        ? 'text-gray-500 dark:text-gray-500'
                        : 'text-gray-900 dark:text-white'
                    }`}>
                      {comparison.currentUserStats.totalMatches}
                    </div>
                  </div>
                  <div className="text-center text-sm font-semibold text-gray-600 dark:text-gray-400">
                    {t('profile.totalMatches') || 'Total Matches'}
                  </div>
                  <div className="text-left">
                    <div className={`text-2xl font-bold ${
                      comparison.otherUserStats.totalMatches > comparison.currentUserStats.totalMatches
                        ? 'text-green-600 dark:text-green-400'
                        : comparison.otherUserStats.totalMatches < comparison.currentUserStats.totalMatches
                        ? 'text-gray-500 dark:text-gray-500'
                        : 'text-gray-900 dark:text-white'
                    }`}>
                      {comparison.otherUserStats.totalMatches}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl px-6 py-3">
                <div className="grid grid-cols-3 gap-4 items-center">
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${
                      comparison.currentUserStats.gamesLast30Days > comparison.otherUserStats.gamesLast30Days
                        ? 'text-green-600 dark:text-green-400'
                        : comparison.currentUserStats.gamesLast30Days < comparison.otherUserStats.gamesLast30Days
                        ? 'text-gray-500 dark:text-gray-500'
                        : 'text-gray-900 dark:text-white'
                    }`}>
                      {comparison.currentUserStats.gamesLast30Days}
                    </div>
                  </div>
                  <div className="text-center text-sm font-semibold text-gray-600 dark:text-gray-400">
                    {t('playerCard.gamesLast30Days')}
                  </div>
                  <div className="text-left">
                    <div className={`text-2xl font-bold ${
                      comparison.otherUserStats.gamesLast30Days > comparison.currentUserStats.gamesLast30Days
                        ? 'text-green-600 dark:text-green-400'
                        : comparison.otherUserStats.gamesLast30Days < comparison.currentUserStats.gamesLast30Days
                        ? 'text-gray-500 dark:text-gray-500'
                        : 'text-gray-900 dark:text-white'
                    }`}>
                      {comparison.otherUserStats.gamesLast30Days}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl px-6 py-3">
                <div className="grid grid-cols-3 gap-4 items-center">
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${
                      comparison.currentUserStats.totalWins > comparison.otherUserStats.totalWins
                        ? 'text-green-600 dark:text-green-400'
                        : comparison.currentUserStats.totalWins < comparison.otherUserStats.totalWins
                        ? 'text-gray-500 dark:text-gray-500'
                        : 'text-gray-900 dark:text-white'
                    }`}>
                      {comparison.currentUserStats.totalWins}
                    </div>
                  </div>
                  <div className="text-center text-sm font-semibold text-gray-600 dark:text-gray-400">
                    {t('playerCard.gamesWon')}
                  </div>
                  <div className="text-left">
                    <div className={`text-2xl font-bold ${
                      comparison.otherUserStats.totalWins > comparison.currentUserStats.totalWins
                        ? 'text-green-600 dark:text-green-400'
                        : comparison.otherUserStats.totalWins < comparison.currentUserStats.totalWins
                        ? 'text-gray-500 dark:text-gray-500'
                        : 'text-gray-900 dark:text-white'
                    }`}>
                      {comparison.otherUserStats.totalWins}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl px-6 py-3">
                <div className="grid grid-cols-3 gap-4 items-center">
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${
                      parseFloat(comparison.currentUserStats.winsPercentage) > parseFloat(comparison.otherUserStats.winsPercentage)
                        ? 'text-green-600 dark:text-green-400'
                        : parseFloat(comparison.currentUserStats.winsPercentage) < parseFloat(comparison.otherUserStats.winsPercentage)
                        ? 'text-gray-500 dark:text-gray-500'
                        : 'text-gray-900 dark:text-white'
                    }`}>
                      {comparison.currentUserStats.winsPercentage}%
                    </div>
                  </div>
                  <div className="text-center text-sm font-semibold text-gray-600 dark:text-gray-400">
                    {t('playerCard.winRate')}
                  </div>
                  <div className="text-left">
                    <div className={`text-2xl font-bold ${
                      parseFloat(comparison.otherUserStats.winsPercentage) > parseFloat(comparison.currentUserStats.winsPercentage)
                        ? 'text-green-600 dark:text-green-400'
                        : parseFloat(comparison.otherUserStats.winsPercentage) < parseFloat(comparison.currentUserStats.winsPercentage)
                        ? 'text-gray-500 dark:text-gray-500'
                        : 'text-gray-900 dark:text-white'
                    }`}>
                      {comparison.otherUserStats.winsPercentage}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {!loading && !comparison && selectedPlayerId && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          {t('profile.noComparisonData') || 'No comparison data available'}
        </div>
      )}

      {showPlayerModal && (
        <PlayerListModal
          onClose={() => setShowPlayerModal(false)}
          multiSelect={false}
          onConfirm={handlePlayerSelect}
          filterPlayerIds={currentUser?.id ? [currentUser.id] : []}
        />
      )}
    </div>
  );
};

