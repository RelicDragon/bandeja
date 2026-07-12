import { useEffect, useRef } from 'react';
import { Minus, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { TeamSideState } from './ScoreEntryTeamPanel';

interface ScoreStepperProps {
  value: number;
  onChange: (next: number) => void;
  onValueClick: () => void;
  max: number;
  layout: 'inline' | 'stacked' | 'compact';
  state: TeamSideState;
  isActive: boolean;
  valueAriaLabel: string;
}

const VALUE_CLASS: Record<TeamSideState, string> = {
  leading:
    'border-emerald-500 bg-emerald-500 text-white dark:border-emerald-500 dark:bg-emerald-600',
  trailing:
    'border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400',
  neutral:
    'border-gray-200 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white',
};

const STEP_CLASS =
  'flex items-center justify-center rounded-xl border-2 border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 active:scale-95 disabled:opacity-30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700';

export const ScoreStepper = ({
  value,
  onChange,
  onValueClick,
  max,
  layout,
  state,
  isActive,
  valueAriaLabel,
}: ScoreStepperProps) => {
  const prev = useRef(value);
  const dir = value >= prev.current ? 1 : -1;
  useEffect(() => {
    prev.current = value;
  }, [value]);

  const isStacked = layout === 'stacked';
  const tileSize = isStacked ? 'h-14 w-full' : 'h-14 w-14 shrink-0';
  const stepSize = isStacked ? 'h-14 flex-1 min-w-0' : 'h-14 w-14 shrink-0';
  const iconSize = 'h-5 w-5';

  const minus = (
    <button
      type="button"
      aria-label="-1"
      disabled={value <= 0}
      onClick={() => onChange(Math.max(0, value - 1))}
      className={`${STEP_CLASS} ${stepSize}`}
    >
      <Minus className={iconSize} strokeWidth={2.5} />
    </button>
  );

  const plus = (
    <button
      type="button"
      aria-label="+1"
      disabled={value >= max}
      onClick={() => onChange(value + 1)}
      className={`${STEP_CLASS} ${stepSize}`}
    >
      <Plus className={iconSize} strokeWidth={2.5} />
    </button>
  );

  const scoreBtn = (
    <motion.button
      type="button"
      aria-label={valueAriaLabel}
      aria-expanded={isActive}
      onClick={onValueClick}
      whileTap={{ scale: 0.96 }}
      className={`flex items-center justify-center overflow-hidden rounded-xl border-2 tabular-nums text-4xl font-bold transition-shadow ${tileSize} ${VALUE_CLASS[state]} ${
        isActive ? 'ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-gray-900' : ''
      }`}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          initial={{ y: dir * 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: dir * -16, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );

  if (isStacked) {
    return (
      <div className="flex w-full flex-col items-center gap-1.5">
        {scoreBtn}
        <div className="flex w-full items-center gap-1.5">
          {minus}
          {plus}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {minus}
      {scoreBtn}
      {plus}
    </div>
  );
};
