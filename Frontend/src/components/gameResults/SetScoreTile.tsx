import type { MouseEvent } from 'react';
import { motion } from 'framer-motion';
import type { SetScoreTileState } from './setScoreTileState';

const TILE_STATE_CLASS: Record<SetScoreTileState, string> = {
  win: 'border-transparent bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-md shadow-emerald-500/30',
  loss: 'border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-500',
  tie: 'border-transparent bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/25',
  neutral: 'border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const NEUTRAL_EDITABLE_CLASS =
  'border-dashed border-primary-300 bg-primary-50/60 text-primary-600 dark:border-primary-700 dark:bg-primary-950/30 dark:text-primary-300';

const EXTRA_CLASS =
  'border-dashed border-violet-300 bg-violet-50/70 text-violet-700 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-300';

interface SetScoreTileProps {
  value: number;
  state: SetScoreTileState;
  editable: boolean;
  isExtra?: boolean;
  size?: 'md' | 'lg';
  /** Small label rendered at the top-right corner (e.g. tiebreak abbreviation). */
  topBadge?: string | null;
  /** Small label rendered below the tile (e.g. extra games/balls abbreviation). */
  bottomBadge?: string | null;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}

export const SetScoreTile = ({
  value,
  state,
  editable,
  isExtra = false,
  size = 'md',
  topBadge,
  bottomBadge,
  onClick,
}: SetScoreTileProps) => {
  const sizeClass =
    size === 'lg'
      ? 'h-11 w-11 text-xl sm:h-12 sm:w-12 sm:text-2xl'
      : 'h-10 w-10 text-lg sm:h-11 sm:w-11 sm:text-xl';

  const stateClass = isExtra
    ? EXTRA_CLASS
    : state === 'neutral' && editable
      ? NEUTRAL_EDITABLE_CLASS
      : TILE_STATE_CLASS[state];

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={editable ? { scale: 1.08, y: -1 } : undefined}
      whileTap={editable ? { scale: 0.92 } : undefined}
      transition={{ type: 'spring', stiffness: 480, damping: 24 }}
      className={`relative flex shrink-0 items-center justify-center rounded-xl border font-bold tabular-nums ${sizeClass} ${stateClass} ${
        editable ? 'cursor-pointer' : 'cursor-default'
      }`}
    >
      <motion.span
        key={value}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 26 }}
      >
        {value}
      </motion.span>
      {topBadge ? (
        <span className="absolute -right-1 -top-2 rounded-md bg-white px-1 text-[8px] font-bold leading-tight text-primary-600 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-800 dark:text-primary-400 dark:ring-gray-700 sm:text-[9px]">
          {topBadge}
        </span>
      ) : null}
      {bottomBadge ? (
        <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-[7px] font-bold uppercase tracking-tight text-violet-600 dark:text-violet-400">
          {bottomBadge}
        </span>
      ) : null}
    </motion.button>
  );
};
