import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, GameCard } from '@/components';
import { Game } from '@/types';
import { ChevronDown, ChevronUp } from 'lucide-react';

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
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<string>('0px');
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (contentRef.current) {
      if (showPastGames) {
        setIsAnimating(true);
        setMaxHeight(`${contentRef.current.scrollHeight}px`);
      } else {
        setMaxHeight('0px');
      }
    }
  }, [showPastGames, pastGames, loadingPastGames]);

  const handleTransitionEnd = () => {
    if (!showPastGames) {
      setIsAnimating(false);
    }
  };

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
      
      <div
        ref={contentRef}
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight }}
        onTransitionEnd={handleTransitionEnd}
      >
        <div className="space-y-4">
          {(showPastGames || isAnimating) && (
            <>
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
                      isInitiallyCollapsed={index !== 0}
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
                <Button
                  onClick={onLoadMore}
                  variant="secondary"
                  size="sm"
                  className="w-full"
                >
                  {t('home.loadMore')}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

