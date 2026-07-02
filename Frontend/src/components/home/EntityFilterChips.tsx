import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Users, Swords, Dumbbell, Trophy, type LucideIcon } from 'lucide-react';

export type EntityFilterType = 'game' | 'tournament' | 'training' | 'leagues';

interface EntityFilterChipsProps {
  gameActive: boolean;
  tournamentActive: boolean;
  trainingActive: boolean;
  leaguesActive: boolean;
  onToggle: (type: EntityFilterType) => void;
}

interface ChipProps {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}

const Chip = ({ icon: Icon, label, active, onClick }: ChipProps) => (
  <motion.button
    type="button"
    onClick={onClick}
    whileTap={{ scale: 0.95 }}
    transition={{ type: 'spring', stiffness: 400, damping: 17 }}
    aria-pressed={active}
    className={`relative flex items-center justify-center gap-2 overflow-hidden rounded-xl p-3 text-sm font-medium ring-1 ring-inset transition-colors duration-200 ${
      active
        ? 'bg-gradient-to-br from-primary-500/15 to-primary-600/10 text-primary-700 shadow-sm shadow-primary-500/10 ring-primary-500/40 dark:from-primary-400/20 dark:to-primary-500/10 dark:text-primary-300 dark:ring-primary-400/40'
        : 'bg-gray-100 text-gray-700 ring-transparent hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
    }`}
  >
    <motion.span
      animate={{ scale: active ? 1.15 : 1, rotate: active ? [0, -10, 10, 0] : 0 }}
      transition={{
        scale: { type: 'spring', stiffness: 320, damping: 16 },
        rotate: active
          ? { duration: 0.45, ease: 'easeInOut', times: [0, 0.2, 0.6, 1] }
          : { type: 'spring', stiffness: 320, damping: 16 },
      }}
      className="flex shrink-0 items-center justify-center"
    >
      <Icon
        size={18}
        fill={active ? 'currentColor' : 'none'}
        className={active ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'}
      />
    </motion.span>
    <span className="truncate">{label}</span>
  </motion.button>
);

export const EntityFilterChips = ({
  gameActive,
  tournamentActive,
  trainingActive,
  leaguesActive,
  onToggle,
}: EntityFilterChipsProps) => {
  const { t } = useTranslation();

  return (
    <div className="mx-auto mb-3 grid max-w-md grid-cols-2 gap-2">
      <Chip
        icon={Users}
        label={t('games.entityTypes.GAME', { defaultValue: 'Games' })}
        active={gameActive}
        onClick={() => onToggle('game')}
      />
      <Chip
        icon={Swords}
        label={t('games.entityTypes.TOURNAMENT', { defaultValue: 'Tournament' })}
        active={tournamentActive}
        onClick={() => onToggle('tournament')}
      />
      <Chip
        icon={Dumbbell}
        label={t('games.training', { defaultValue: 'Training' })}
        active={trainingActive}
        onClick={() => onToggle('training')}
      />
      <Chip
        icon={Trophy}
        label={t('games.entityTypes.LEAGUE', { defaultValue: 'Leagues' })}
        active={leaguesActive}
        onClick={() => onToggle('leagues')}
      />
    </div>
  );
};
