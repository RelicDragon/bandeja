import { Trophy, Clock, AlertCircle, Users, CalendarX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GameState } from '@/types/gameResults';

interface GameStatusDisplayProps {
  gameState: GameState | null;
}

export const GameStatusDisplay = ({ gameState }: GameStatusDisplayProps) => {
  const { t } = useTranslation();
  
  if (!gameState) return null;
  
  const { type, message, showClock, canEdit } = gameState;
  
  const getStyling = () => {
    switch (type) {
      case 'ACCESS_DENIED':
      case 'GAME_ARCHIVED':
        return {
          iconColor: 'text-red-500',
          iconBg: 'bg-red-100 dark:bg-red-900/30',
          titleColor: 'text-gray-900 dark:text-white',
          textColor: 'text-gray-600 dark:text-gray-300',
          bgGradient: 'from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20',
          Icon: AlertCircle,
          glowColor: 'shadow-red-200 dark:shadow-red-900/50'
        };
      case 'GAME_NOT_STARTED':
        return {
          iconColor: 'text-amber-500',
          iconBg: 'bg-amber-100 dark:bg-amber-900/30',
          titleColor: 'text-gray-900 dark:text-white',
          textColor: 'text-gray-600 dark:text-gray-300',
          bgGradient: 'from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20',
          Icon: CalendarX,
          glowColor: 'shadow-amber-200 dark:shadow-amber-900/50'
        };
      case 'INSUFFICIENT_PLAYERS':
        return {
          iconColor: 'text-orange-500',
          iconBg: 'bg-orange-100 dark:bg-orange-900/30',
          titleColor: 'text-gray-900 dark:text-white',
          textColor: 'text-gray-600 dark:text-gray-300',
          bgGradient: 'from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20',
          Icon: Users,
          glowColor: 'shadow-orange-200 dark:shadow-orange-900/50'
        };
      case 'NO_RESULTS':
      case 'HAS_RESULTS':
        return {
          iconColor: 'text-primary-500',
          iconBg: 'bg-primary-100 dark:bg-primary-900/30',
          titleColor: 'text-gray-900 dark:text-white',
          textColor: 'text-gray-600 dark:text-gray-300',
          bgGradient: 'from-primary-50 to-blue-50 dark:from-primary-950/20 dark:to-blue-950/20',
          Icon: Trophy,
          glowColor: 'shadow-primary-200 dark:shadow-primary-900/50'
        };
      default:
        return {
          iconColor: 'text-gray-500',
          iconBg: 'bg-gray-100 dark:bg-gray-800',
          titleColor: 'text-gray-900 dark:text-white',
          textColor: 'text-gray-600 dark:text-gray-300',
          bgGradient: 'from-gray-50 to-gray-100 dark:from-gray-900/20 dark:to-gray-800/20',
          Icon: Trophy,
          glowColor: 'shadow-gray-200 dark:shadow-gray-800/50'
        };
    }
  };
  
  const styling = getStyling();
  const Icon = styling.Icon;
  
  return (
    <div className={`relative flex flex-col items-center justify-center min-h-[400px] p-8 text-center rounded-2xl bg-gradient-to-br ${styling.bgGradient} overflow-hidden`}>
      {/* Decorative background circles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute -top-24 -right-24 w-64 h-64 rounded-full ${styling.iconBg} opacity-30 blur-3xl animate-pulse`}></div>
        <div className={`absolute -bottom-24 -left-24 w-64 h-64 rounded-full ${styling.iconBg} opacity-20 blur-3xl animate-pulse`} style={{ animationDelay: '1s' }}></div>
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Icon container with animation */}
        <div className={`mb-8 inline-flex p-6 rounded-full ${styling.iconBg} ${styling.glowColor} shadow-2xl animate-bounce-slow`}>
          <Icon size={72} className={`${styling.iconColor} animate-pulse-slow`} strokeWidth={1.5} />
        </div>
        
        {/* Title */}
        <h3 className={`text-3xl font-bold ${styling.titleColor} mb-3 tracking-tight`}>
          {type === 'ACCESS_DENIED' 
            ? t('errors.accessDenied') 
            : type === 'HAS_RESULTS' 
            ? t('gameResults.hasResultsTitle') 
            : t('gameResults.noResultsTitle')}
        </h3>
        
        {/* Message */}
        <p className={`${styling.textColor} text-lg mb-6 max-w-md leading-relaxed`}>
          {t(message)}
        </p>
        
        {/* Clock indicator */}
        {showClock && (
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-medium shadow-sm animate-fade-in`}>
            {!canEdit && <Clock size={16} className="animate-spin-slow" />}
            <span>{t('gameResults.resultsCanBeEntered')}</span>
          </div>
        )}
      </div>

      {/* Bottom decorative line */}
      <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${styling.bgGradient} opacity-50`}></div>
    </div>
  );
};

