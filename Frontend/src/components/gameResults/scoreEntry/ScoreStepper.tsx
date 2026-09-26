import { useEffect, useRef } from 'react';
import { Minus, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { hapticSelection } from '@/utils/haptics';
import type { TeamSideState } from './ScoreEntryTeamPanel';
import { EASE_CLASS, SCORE_ENTRY_SPRING, SOFT_CONTROL_CLASS } from './scoreEntryStyles';

interface ScoreStepperProps {
  value: number;
  onChange: (next: number) => void;
  onValueClick: () => void;
  max: number;
  layout: 'stacked' | 'compact';
  state: TeamSideState;
  isActive: boolean;
  valueAriaLabel: string;
}

/** Shared by both tiles so the keypad focus halo glides from one team to the other. */
const ACTIVE_HALO_LAYOUT_ID = 'score-entry-active-tile';

const DIGIT_TONE: Record<TeamSideState, string> = {
  leading: 'text-white',
  neutral: 'text-gray-900 dark:text-white',
  trailing: 'text-gray-400 dark:text-gray-500',
};

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
  const tileSize = isStacked ? 'h-[5.25rem] w-full' : 'h-14 w-[4.5rem] shrink-0';
  const digitSize = isStacked ? 'text-[3.25rem]' : 'text-[2rem]';
  const stepSize = isStacked ? 'h-11 min-w-0 flex-1' : 'h-12 w-12 shrink-0';
  const travel = isStacked ? 30 : 20;

  const step = (next: number) => {
    hapticSelection();
    onChange(next);
  };

  const minus = (
    <button
      type="button"
      aria-label="-1"
      disabled={value <= 0}
      onClick={() => step(Math.max(0, value - 1))}
      className={`flex items-center justify-center rounded-full text-gray-700 dark:text-gray-200 ${SOFT_CONTROL_CLASS} ${stepSize}`}
    >
      <Minus size={18} strokeWidth={1.75} aria-hidden />
    </button>
  );

  const plus = (
    <button
      type="button"
      aria-label="+1"
      disabled={value >= max}
      onClick={() => step(value + 1)}
      className={`flex items-center justify-center rounded-full text-gray-700 dark:text-gray-200 ${SOFT_CONTROL_CLASS} ${stepSize}`}
    >
      <Plus size={18} strokeWidth={1.75} aria-hidden />
    </button>
  );

  const scoreTile = (
    <motion.button
      type="button"
      aria-label={valueAriaLabel}
      aria-expanded={isActive}
      onClick={onValueClick}
      whileTap={{ scale: 0.965 }}
      transition={SCORE_ENTRY_SPRING}
      className={`relative isolate flex items-center justify-center rounded-[1.25rem] transition-colors duration-500 ${EASE_CLASS} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60 ${tileSize} ${DIGIT_TONE[state]}`}
    >
      <AnimatePresence initial={false}>
        {isActive ? (
          <motion.span
            key="halo"
            layoutId={ACTIVE_HALO_LAYOUT_ID}
            aria-hidden
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={SCORE_ENTRY_SPRING}
            className="absolute -inset-[5px] -z-10 rounded-[1.5rem] bg-primary-500/[0.1] ring-[1.5px] ring-primary-500/70 dark:bg-primary-400/[0.12] dark:ring-primary-400/70"
          />
        ) : null}
      </AnimatePresence>

      {/* Recessed well the digit sits in. */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-[inherit] bg-gray-100 shadow-[inset_0_1px_2px_rgba(15,23,42,0.08),inset_0_0_0_1px_rgba(15,23,42,0.04)] dark:bg-black/35 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(255,255,255,0.05)]"
      />
      {/* Leading backlight, cross-faded so the lead changing hands never jump-cuts. */}
      <span
        aria-hidden
        className={`absolute inset-0 rounded-[inherit] bg-gradient-to-b from-emerald-400 to-emerald-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-1px_0_rgba(6,78,59,0.25),0_14px_26px_-14px_rgba(5,150,105,0.85)] transition-opacity duration-500 ${EASE_CLASS} ${
          state === 'leading' ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <span className="absolute inset-0 overflow-hidden rounded-[inherit]">
        <AnimatePresence initial={false}>
          <motion.span
            key={value}
            initial={{ y: dir * travel, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: dir * -travel, opacity: 0, scale: 0.9 }}
            transition={SCORE_ENTRY_SPRING}
            className={`absolute inset-0 flex items-center justify-center font-brand font-semibold leading-none tracking-[-0.03em] tabular-nums ${digitSize}`}
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </span>
    </motion.button>
  );

  if (isStacked) {
    return (
      <div className="flex w-full flex-col items-stretch gap-2">
        {scoreTile}
        <div className="flex w-full items-center gap-2">
          {minus}
          {plus}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {minus}
      {scoreTile}
      {plus}
    </div>
  );
};
