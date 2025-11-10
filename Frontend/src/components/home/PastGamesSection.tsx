import { useTranslation } from 'react-i18next';
import { Card, GameCard } from '@/components';
import { Game } from '@/types';
import { ChevronDown, ChevronUp, ArrowDown } from 'lucide-react';

interface PastGamesSectionProps {
  pastGames: Game[];
  showPastGames: boolean;
  loadingPastGames: boolean;
  hasMorePastGames: boolean;
  user: any;
  pastGamesUnreadCounts?: Record<string, number>;
  onToggle: () => void;
  onLoadMore: () => void;
}

export const PastGamesSection = ({
  pastGames,
  showPastGames,
  loadingPastGames,
  hasMorePastGames,
  user,
  pastGamesUnreadCounts = {},
  onToggle,
  onLoadMore,
}: PastGamesSectionProps) => {
  const { t } = useTranslation();

  return (
    <div className="mt-6">
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full text-lg font-semibold text-gray-900 dark:text-white mb-3 hover:opacity-80 transition-opacity"
      >
        <span>{t('home.pastGames')}</span>
        <div className="transition-transform duration-300">
          {showPastGames ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      </button>
      
      {showPastGames && (
        <div className="space-y-4">
          {pastGames.length === 0 && !loadingPastGames ? (
            <Card className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 mb-4">{t('home.noPastGames')}</p>
            </Card>
          ) : (
            pastGames.map((game, index) => (
              <div
                key={game.id}
                className="transition-all duration-500 ease-in-out animate-in slide-in-from-top-4"
                style={{
                  animationDelay: `${index * 50}ms`
                }}
              >
                <GameCard
                  game={game}
                  user={user}
                  isInitiallyCollapsed={true}
                  unreadCount={pastGamesUnreadCounts[game.id] || 0}
                />
              </div>
            ))
          )}
          
          {loadingPastGames && (
            <Card className="p-4 text-center">
              <p className="text-gray-600 dark:text-gray-400">{t('common.loading')}</p>
            </Card>
          )}
          
          {hasMorePastGames && !loadingPastGames && pastGames.length > 0 && (
            <div className="flex justify-center">
              <button
                onClick={onLoadMore}
                className="py-3 px-6 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 shadow-lg shadow-primary-500/50 hover:shadow-xl hover:shadow-primary-600/60 transition-all duration-300 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                <span>{t('home.loadMore')}</span>
                <ArrowDown size={16} className="animate-bounce" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

