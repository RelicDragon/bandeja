import { Swords, Trophy, Dumbbell, Beer } from 'lucide-react';
import type { Game } from '@/types';

export function getEntityIcon(entityType: Game['entityType']) {
  switch (entityType) {
    case 'TOURNAMENT':
      return <Swords size={12} />;
    case 'LEAGUE':
    case 'LEAGUE_SEASON':
      return <Trophy size={12} />;
    case 'TRAINING':
      return <Dumbbell size={12} />;
    case 'BAR':
      return <Beer size={12} />;
    default:
      return null;
  }
}

export function getEntityTagClasses(entityType: Game['entityType']): string {
  switch (entityType) {
    case 'TOURNAMENT':
      return 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-800';
    case 'LEAGUE':
    case 'LEAGUE_SEASON':
      return 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-800';
    case 'TRAINING':
      return 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-800';
    case 'BAR':
      return 'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-800';
    default:
      return 'text-primary-700 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 border-primary-200 dark:border-primary-800';
  }
}
