import type { EntityType } from '@/types';

/** Explicit class strings (Tailwind must see them as static literals in scanned files). */
export function storySlideBackgroundClass(entityType: EntityType): string {
  switch (entityType) {
    case 'TOURNAMENT':
      return 'bg-gradient-to-br from-red-600 via-orange-500 to-rose-900';
    case 'LEAGUE':
    case 'LEAGUE_SEASON':
      return 'bg-gradient-to-br from-blue-600 via-indigo-500 to-violet-900';
    case 'TRAINING':
      return 'bg-gradient-to-br from-emerald-500 via-teal-500 to-green-900';
    case 'BAR':
      return 'bg-gradient-to-br from-amber-400 via-orange-500 to-amber-900';
    case 'GAME':
    default:
      return 'bg-gradient-to-br from-sky-500 via-cyan-500 to-primary-900';
  }
}

export function storySlideGlowTopClass(entityType: EntityType): string {
  switch (entityType) {
    case 'TOURNAMENT':
      return 'bg-orange-300/40';
    case 'LEAGUE':
    case 'LEAGUE_SEASON':
      return 'bg-sky-300/35';
    case 'TRAINING':
      return 'bg-emerald-200/40';
    case 'BAR':
      return 'bg-yellow-200/45';
    case 'GAME':
    default:
      return 'bg-cyan-200/40';
  }
}

export function storySlideGlowBottomClass(entityType: EntityType): string {
  switch (entityType) {
    case 'TOURNAMENT':
      return 'bg-rose-500/30';
    case 'LEAGUE':
    case 'LEAGUE_SEASON':
      return 'bg-violet-400/30';
    case 'TRAINING':
      return 'bg-teal-400/30';
    case 'BAR':
      return 'bg-orange-500/35';
    case 'GAME':
    default:
      return 'bg-primary-400/30';
  }
}
