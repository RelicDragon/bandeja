import { Card, Button } from '@/components';
import { Game, User } from '@/types';
import { getGameResultStatus } from '@/utils/gameResults';
import { useTranslation } from 'react-i18next';

interface GameResultsProps {
  game: Game;
  user?: User | null;
  canEnterResults: boolean;
  onEnterResults: () => void;
}

export const GameResults = ({ 
  game, 
  user, 
  canEnterResults, 
  onEnterResults 
}: GameResultsProps) => {
  const { t } = useTranslation();
  
  const resultStatus = getGameResultStatus(game, user ?? null);

  if (game.status !== 'ANNOUNCED' && game.status !== 'STARTED' && game.status !== 'FINISHED' && game.status !== 'ARCHIVED') {
    return null;
  }

  if (!resultStatus) {
    return null;
  }

  // Check if this is an access denied message
  const isAccessDenied = resultStatus.message === 'games.results.problems.accessDenied';
  
  // Show view button even if user can't edit but results exist
  const hasResults = game.resultsStatus === 'FINAL' || game.resultsStatus === 'IN_PROGRESS';
  const showButton = !isAccessDenied && (canEnterResults || hasResults);

  return (
    <Card>
      <div className={`p-4 rounded-lg ${
        isAccessDenied
          ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
          : resultStatus.canModify 
            ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
            : hasResults
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
              : 'bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">            
            <span className={`text-sm font-medium ${
              isAccessDenied
                ? 'text-red-800 dark:text-red-200'
                : resultStatus.canModify
                  ? 'text-blue-800 dark:text-blue-200'
                  : hasResults
                    ? 'text-green-800 dark:text-green-200'
                    : 'text-gray-600 dark:text-gray-400'
            }`}>
              {resultStatus.message.split(' • ').map(key => t(key)).join(' • ')}
            </span>
          </div>
          {showButton && (
            <Button
              onClick={onEnterResults}
              size="sm"
              variant={game.resultsStatus !== 'NONE' ? "outline" : "primary"}
            >
              {(() => {
                const resultsStatus = game.resultsStatus || 'NONE';
                if (resultsStatus === 'FINAL') {
                  return t('gameResults.viewResults');
                } else if (resultsStatus === 'IN_PROGRESS') {
                  return canEnterResults ? t('gameResults.continueResultsEntry') : t('gameResults.viewResults');
                } else {
                  return t('gameResults.startResultsEntry');
                }
              })()}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};
