import { Card, Button } from '@/components';
import { Game, User } from '@/types';
import { getGameResultStatus } from '@/utils/gameResults';
import { Award } from 'lucide-react';
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

  if (game.status !== 'STARTED' && game.status !== 'FINISHED') {
    return null;
  }

  if (!resultStatus) {
    return null;
  }

  // Check if this is an access denied message
  const isAccessDenied = resultStatus.message === 'games.results.problems.accessDenied';

  return (
    <Card>
      <div className={`p-4 rounded-lg ${
        isAccessDenied
          ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
          : resultStatus.canModify 
            ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
            : 'bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award size={20} className={
              isAccessDenied
                ? 'text-red-600 dark:text-red-400'
                : resultStatus.canModify 
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 dark:text-gray-400'
            } />
            <span className={`text-sm font-medium ${
              isAccessDenied
                ? 'text-red-800 dark:text-red-200'
                : resultStatus.canModify
                  ? 'text-blue-800 dark:text-blue-200'
                  : 'text-gray-600 dark:text-gray-400'
            }`}>
              {resultStatus.message.split(' • ').map(key => t(key)).join(' • ')}
            </span>
          </div>
          {!isAccessDenied && canEnterResults && (
            <Button
              onClick={onEnterResults}
              size="sm"
              variant={game.hasResults ? "outline" : "primary"}
            >
              {game.hasResults ? t('gameResults.changeResults') : t('gameResults.enterResults')}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};
