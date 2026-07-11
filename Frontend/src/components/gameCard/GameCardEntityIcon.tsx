import { useTranslation } from 'react-i18next';
import { Beer, Dumbbell, Swords, Trophy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { EntityType } from '@/types';

const ENTITY_ICONS: Partial<Record<EntityType, { Icon: LucideIcon; className: string }>> = {
  TOURNAMENT: {
    Icon: Swords,
    className: 'bg-red-100/80 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  },
  LEAGUE: {
    Icon: Trophy,
    className: 'bg-blue-100/80 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
  },
  LEAGUE_SEASON: {
    Icon: Trophy,
    className: 'bg-blue-100/80 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
  },
  TRAINING: {
    Icon: Dumbbell,
    className: 'bg-green-100/80 text-green-600 dark:bg-green-900/40 dark:text-green-400',
  },
  BAR: {
    Icon: Beer,
    className: 'bg-amber-100/80 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  },
};

/** Round color-coded glyph identifying the entity type at a glance. */
export function GameCardEntityIcon({ entityType }: { entityType: EntityType }) {
  const { t } = useTranslation();
  const entry = ENTITY_ICONS[entityType];
  if (!entry) return null;
  const { Icon, className } = entry;
  const label = t(`games.entityTypes.${entityType}`);
  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${className}`}
      title={label}
      aria-label={label}
    >
      <Icon size={13} />
    </span>
  );
}
