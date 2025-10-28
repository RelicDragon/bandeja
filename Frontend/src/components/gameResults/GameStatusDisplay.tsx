import { Trophy, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GameState } from '@/types/gameResults';

interface GameStatusDisplayProps {
  gameState: GameState | null;
}

export const GameStatusDisplay = ({ gameState }: GameStatusDisplayProps) => {
  const { t } = useTranslation();
  
  if (!gameState) return null;
  
  const { type, message, showClock } = gameState;
  
  const getStyling = () => {
    switch (type) {
      case 'ACCESS_DENIED':
      case 'GAME_ARCHIVED':
        return {
          iconColor: 'text-red-300 dark:text-red-600',
          titleColor: 'text-red-700 dark:text-red-300',
          textColor: 'text-red-500 dark:text-red-400',
          bgColor: 'bg-red-50 dark:bg-red-900/20'
        };
      case 'GAME_NOT_STARTED':
      case 'INSUFFICIENT_PLAYERS':
        return {
          iconColor: 'text-yellow-300 dark:text-yellow-600',
          titleColor: 'text-yellow-700 dark:text-yellow-300',
          textColor: 'text-yellow-500 dark:text-yellow-400',
          bgColor: 'bg-yellow-50 dark:bg-yellow-900/20'
        };
      case 'NO_RESULTS':
      case 'HAS_RESULTS':
        return {
          iconColor: 'text-gray-300 dark:text-gray-600',
          titleColor: 'text-gray-700 dark:text-gray-300',
          textColor: 'text-gray-500 dark:text-gray-400',
          bgColor: 'bg-gray-50 dark:bg-gray-900/20'
        };
      default:
        return {
          iconColor: 'text-gray-300 dark:text-gray-600',
          titleColor: 'text-gray-700 dark:text-gray-300',
          textColor: 'text-gray-500 dark:text-gray-400',
          bgColor: 'bg-gray-50 dark:bg-gray-900/20'
        };
    }
  };
  
  const styling = getStyling();
  
  return (
    <div className={`flex flex-col items-center justify-center min-h-[400px] p-8 text-center rounded-lg ${styling.bgColor}`}>
      <div className="mb-6">
        <Trophy size={64} className={`${styling.iconColor} mx-auto`} />
      </div>
      <h3 className={`text-xl font-semibold ${styling.titleColor} mb-2`}>
        {type === 'ACCESS_DENIED' ? t('errors.accessDenied') : t('gameResults.noResultsTitle')}
      </h3>
      <p className={`${styling.textColor} mb-4 max-w-md`}>
        {t(message)}
      </p>
      {showClock && (
        <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
          <Clock size={16} />
          <span>{t('gameResults.resultsCanBeEntered')}</span>
        </div>
      )}
    </div>
  );
};

