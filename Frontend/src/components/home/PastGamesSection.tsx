import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { History, ArrowDown } from 'lucide-react';
import { GameCard } from '@/components';
import { Game } from '@/types';
import { AnimatedGameList } from './AnimatedGameList';
import { EmptyStateCard } from './EmptyStateCard';
import { GamesLoadingSkeleton } from './GameCardSkeleton';

interface PastGamesSectionProps {
  pastGames: Game[];
  loadingPastGames: boolean;
  hasMorePastGames: boolean;
  user: any;
  pastGamesUnreadCounts?: Record<string, number>;
  onLoadMore: () => void;
  onNoteSaved?: (gameId: string) => void;
}

export const PastGamesSection = ({
  pastGames,
  loadingPastGames,
  hasMorePastGames,
  user,
  pastGamesUnreadCounts = {},
  onLoadMore,
  onNoteSaved,
}: PastGamesSectionProps) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {pastGames.length === 0 && !loadingPastGames ? (
        <EmptyStateCard icon={History} title={t('home.noPastGames')} />
      ) : (
        <AnimatedGameList
          items={pastGames}
          getKey={(game) => game.id}
          renderItem={(game) => (
            <GameCard
              game={game}
              user={user}
              unreadCount={pastGamesUnreadCounts[game.id] || 0}
              onNoteSaved={onNoteSaved}
            />
          )}
          className="space-y-4"
        />
      )}

      {loadingPastGames && <GamesLoadingSkeleton count={2} className="space-y-4" />}

      {hasMorePastGames && !loadingPastGames && pastGames.length > 0 && (
        <div className="flex justify-center">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onLoadMore}
            className="py-3 px-6 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 shadow-lg shadow-primary-500/40 hover:shadow-xl hover:shadow-primary-600/50 transition-all duration-300 ease-in-out flex items-center justify-center gap-2"
          >
            <span>{t('home.loadMore')}</span>
            <ArrowDown size={16} className="animate-bounce" />
          </motion.button>
        </div>
      )}
    </div>
  );
};
