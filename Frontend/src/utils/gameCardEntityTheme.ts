import type { EntityType } from '@/types';

export type GameCardTicketTheme = {
  /** Tinted "when" stub on the start edge of the card. */
  stub: string;
  /** Accent text (day label, entity label). */
  ink: string;
  /** Small entity dot in the eyebrow. */
  dot: string;
  /** Perforation line colour (`currentColor`). */
  perf: string;
};

/** Entity colour lives in the ticket stub only, so a mixed feed stays calm. */
export function getGameCardTicketTheme(entityType: EntityType): GameCardTicketTheme {
  switch (entityType) {
    case 'TOURNAMENT':
      return {
        stub: 'bg-gradient-to-b from-rose-50 to-orange-100/70 dark:from-rose-500/[0.14] dark:to-orange-500/[0.06]',
        ink: 'text-rose-700 dark:text-rose-300',
        dot: 'bg-rose-500',
        perf: 'text-rose-300/80 dark:text-rose-400/30',
      };
    case 'LEAGUE':
    case 'LEAGUE_SEASON':
      return {
        stub: 'bg-gradient-to-b from-indigo-50 to-violet-100/70 dark:from-indigo-500/[0.14] dark:to-violet-500/[0.06]',
        ink: 'text-indigo-700 dark:text-indigo-300',
        dot: 'bg-indigo-500',
        perf: 'text-indigo-300/80 dark:text-indigo-400/30',
      };
    case 'TRAINING':
      return {
        stub: 'bg-gradient-to-b from-emerald-50 to-teal-100/70 dark:from-emerald-500/[0.13] dark:to-teal-500/[0.06]',
        ink: 'text-emerald-700 dark:text-emerald-300',
        dot: 'bg-emerald-500',
        perf: 'text-emerald-300/80 dark:text-emerald-400/30',
      };
    case 'BAR':
      return {
        stub: 'bg-gradient-to-b from-amber-50 to-yellow-100/70 dark:from-amber-500/[0.14] dark:to-yellow-500/[0.06]',
        ink: 'text-amber-700 dark:text-amber-300',
        dot: 'bg-amber-500',
        perf: 'text-amber-300/90 dark:text-amber-400/30',
      };
    case 'EVENT':
      return {
        stub: 'bg-gradient-to-b from-indigo-50 to-violet-100/70 dark:from-indigo-500/[0.14] dark:to-violet-500/[0.06]',
        ink: 'text-indigo-700 dark:text-indigo-300',
        dot: 'bg-indigo-500',
        perf: 'text-indigo-300/80 dark:text-indigo-400/30',
      };
    default:
      return {
        stub: 'bg-gradient-to-b from-primary-50 to-primary-100/70 dark:from-primary-500/[0.13] dark:to-primary-500/[0.06]',
        ink: 'text-primary-700 dark:text-primary-300',
        dot: 'bg-primary-500',
        perf: 'text-primary-300/80 dark:text-primary-400/30',
      };
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
    case 'EVENT':
      return {
        panel:
          'bg-gradient-to-br from-indigo-50/90 via-violet-50/75 to-indigo-50/90 dark:from-indigo-950/30 dark:via-violet-950/18 dark:to-indigo-950/30 border border-indigo-200/85 dark:border-indigo-800/50 backdrop-blur-sm shadow-[0_0_8px_rgba(99,102,241,0.12)] dark:shadow-[0_0_8px_rgba(99,102,241,0.18)]',
        divider: 'border-indigo-200/65 dark:border-indigo-800/45',
        actionHover: 'hover:bg-indigo-100/65 dark:hover:bg-indigo-950/35',
        pickerHover: 'hover:bg-violet-100/55 dark:hover:bg-violet-950/28',
        spinner: 'border-indigo-400 border-t-transparent dark:border-indigo-500',
        muted: 'text-indigo-900/55 dark:text-indigo-300/65',
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
