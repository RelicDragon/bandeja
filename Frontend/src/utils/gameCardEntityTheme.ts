import type { EntityType } from '@/types';

export function getGameCardEntityGradientClasses(entityType: EntityType): string {
  switch (entityType) {
    case 'TOURNAMENT':
      return 'bg-gradient-to-br from-red-50/60 via-orange-50/40 to-red-50/60 dark:from-red-950/25 dark:via-orange-950/15 dark:to-red-950/25 border-l-2 border-red-300 dark:border-red-800 shadow-[0_0_8px_rgba(239,68,68,0.15)] dark:shadow-[0_0_8px_rgba(239,68,68,0.2)]';
    case 'LEAGUE':
    case 'LEAGUE_SEASON':
      return 'bg-gradient-to-br from-blue-50/60 via-purple-50/40 to-blue-50/60 dark:from-blue-950/25 dark:via-purple-950/15 dark:to-blue-950/25 border-l-2 border-blue-300 dark:border-blue-800 shadow-[0_0_8px_rgba(59,130,246,0.15)] dark:shadow-[0_0_8px_rgba(59,130,246,0.2)]';
    case 'TRAINING':
      return 'bg-gradient-to-br from-green-50/60 via-teal-50/40 to-green-50/60 dark:from-green-950/25 dark:via-teal-950/15 dark:to-green-950/25 border-l-2 border-green-300 dark:border-green-800 shadow-[0_0_8px_rgba(34,197,94,0.15)] dark:shadow-[0_0_8px_rgba(34,197,94,0.2)]';
    case 'BAR':
      return 'bg-gradient-to-br from-yellow-50/60 via-amber-50/40 to-yellow-50/60 dark:from-yellow-950/25 dark:via-amber-950/15 dark:to-yellow-950/25 border-l-2 border-yellow-300 dark:border-yellow-800 shadow-[0_0_8px_rgba(234,179,8,0.15)] dark:shadow-[0_0_8px_rgba(234,179,8,0.2)]';
    default:
      return '';
  }
}

export type GameCardReactionTheme = {
  panel: string;
  divider: string;
  actionHover: string;
  pickerHover: string;
  spinner: string;
  muted: string;
};

export function getGameCardReactionTheme(entityType: EntityType): GameCardReactionTheme {
  switch (entityType) {
    case 'TOURNAMENT':
      return {
        panel:
          'bg-gradient-to-br from-red-50/90 via-orange-50/75 to-red-50/90 dark:from-red-950/30 dark:via-orange-950/18 dark:to-red-950/30 border border-red-200/85 dark:border-red-800/50 backdrop-blur-sm shadow-[0_0_8px_rgba(239,68,68,0.12)] dark:shadow-[0_0_8px_rgba(239,68,68,0.18)]',
        divider: 'border-red-200/65 dark:border-red-800/45',
        actionHover: 'hover:bg-red-100/65 dark:hover:bg-red-950/35',
        pickerHover: 'hover:bg-red-100/55 dark:hover:bg-red-950/28',
        spinner: 'border-red-400 border-t-transparent dark:border-red-500',
        muted: 'text-red-900/55 dark:text-red-300/65',
      };
    case 'LEAGUE':
    case 'LEAGUE_SEASON':
      return {
        panel:
          'bg-gradient-to-br from-blue-50/90 via-purple-50/75 to-blue-50/90 dark:from-blue-950/30 dark:via-purple-950/18 dark:to-blue-950/30 border border-blue-200/85 dark:border-blue-800/50 backdrop-blur-sm shadow-[0_0_8px_rgba(59,130,246,0.12)] dark:shadow-[0_0_8px_rgba(59,130,246,0.18)]',
        divider: 'border-blue-200/65 dark:border-blue-800/45',
        actionHover: 'hover:bg-blue-100/65 dark:hover:bg-blue-950/35',
        pickerHover: 'hover:bg-blue-100/55 dark:hover:bg-blue-950/28',
        spinner: 'border-blue-400 border-t-transparent dark:border-blue-500',
        muted: 'text-blue-900/55 dark:text-blue-300/65',
      };
    case 'TRAINING':
      return {
        panel:
          'bg-gradient-to-br from-green-50/90 via-teal-50/75 to-green-50/90 dark:from-green-950/30 dark:via-teal-950/18 dark:to-green-950/30 border border-green-200/85 dark:border-green-800/50 backdrop-blur-sm shadow-[0_0_8px_rgba(34,197,94,0.12)] dark:shadow-[0_0_8px_rgba(34,197,94,0.18)]',
        divider: 'border-green-200/65 dark:border-green-800/45',
        actionHover: 'hover:bg-green-100/65 dark:hover:bg-green-950/35',
        pickerHover: 'hover:bg-green-100/55 dark:hover:bg-green-950/28',
        spinner: 'border-green-400 border-t-transparent dark:border-green-500',
        muted: 'text-green-900/55 dark:text-green-300/65',
      };
    case 'BAR':
      return {
        panel:
          'bg-gradient-to-br from-yellow-50/90 via-amber-50/75 to-yellow-50/90 dark:from-yellow-950/30 dark:via-amber-950/18 dark:to-yellow-950/30 border border-yellow-200/85 dark:border-yellow-800/50 backdrop-blur-sm shadow-[0_0_8px_rgba(234,179,8,0.12)] dark:shadow-[0_0_8px_rgba(234,179,8,0.18)]',
        divider: 'border-yellow-200/65 dark:border-yellow-800/45',
        actionHover: 'hover:bg-yellow-100/65 dark:hover:bg-yellow-950/35',
        pickerHover: 'hover:bg-amber-100/55 dark:hover:bg-amber-950/28',
        spinner: 'border-yellow-500 border-t-transparent dark:border-yellow-400',
        muted: 'text-yellow-900/60 dark:text-yellow-300/65',
      };
    default:
      return {
        panel: 'bg-white/95 dark:bg-gray-900/95 border border-gray-200 dark:border-gray-800 shadow-sm backdrop-blur-sm',
        divider: 'border-gray-200 dark:border-gray-600',
        actionHover: 'hover:bg-gray-100 dark:hover:bg-gray-700',
        pickerHover: 'hover:bg-gray-100 dark:hover:bg-gray-700',
        spinner: 'border-gray-400 border-t-transparent dark:border-gray-500',
        muted: 'text-gray-500 dark:text-gray-400',
      };
  }
}
