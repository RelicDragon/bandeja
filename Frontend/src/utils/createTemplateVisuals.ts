import type { LucideIcon } from 'lucide-react';
import {
  Crown,
  Grid3x3,
  Shuffle,
  Swords,
  Target,
  Timer,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import type { CreateTemplateId } from '@/sport/createFlow';

export function getCreateTemplateIcon(id: CreateTemplateId): LucideIcon {
  if (id === 'PADEL_BEST_OF_3' || id.includes('MATCH_BO3') || id.includes('CLASSIC_BO3') || id === 'PADEL_SINGLES_BO3') return Trophy;
  if (id === 'PADEL_SINGLE_SET' || id === 'PADEL_SINGLES_SINGLE_SET') return Zap;
  if (id === 'PADEL_TIMED' || id.includes('_10') || id.includes('_20')) return Timer;
  if (id === 'PADEL_AMERICANO' || id.includes('AMERICANO')) return Shuffle;
  if (id.includes('KOTC') || id.includes('CHALLENGER')) return Crown;
  if (id.includes('MEXICANO')) return Target;
  if (id.includes('CLUB_RR') || id.includes('ROUND_ROBIN')) return Shuffle;
  if (id.includes('SWISS') || id.includes('BOX')) return Grid3x3;
  if (id.includes('CLASSIC') || id.includes('MATCH')) return Trophy;
  if (id.includes('FAST4')) return Zap;
  if (id.includes('AMERICANO')) return Shuffle;
  if (id.includes('SOCIAL') || id.includes('CLUB')) return Users;
  if (id.includes('_10') || id.includes('_20')) return Timer;
  if (id.includes('SQUASH')) return Swords;
  return Users;
}

export function getCreateTemplateAccentClass(id: CreateTemplateId): string {
  if (id.includes('KOTC') || id.includes('CHALLENGER')) {
    return 'text-amber-600 dark:text-amber-400';
  }
  if (id.includes('MATCH') || id.includes('CLASSIC') || id.includes('OFFICIAL')) {
    return 'text-violet-600 dark:text-violet-400';
  }
  return 'text-emerald-600 dark:text-emerald-400';
}
