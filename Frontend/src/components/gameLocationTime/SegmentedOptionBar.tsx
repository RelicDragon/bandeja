import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { reservationIntentSpringTransition } from './reservationIntentMotion';

export type SegmentedOption<T extends string> = {
  id: T;
  label: string;
  icon: LucideIcon;
  enabled: boolean;
  recommended?: boolean;
};

type SegmentedOptionBarProps<T extends string> = {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (id: T) => void;
  scrollable?: boolean;
  recommendedLabel?: string;
  layoutId: string;
};

export function SegmentedOptionBar<T extends string>({
  value,
  options,
  onChange,
  scrollable = false,
  recommendedLabel,
  layoutId,
}: SegmentedOptionBarProps<T>) {
  const reduceMotion = usePrefersReducedMotion();
  const springTransition = reservationIntentSpringTransition(reduceMotion);

  const columnCount = Math.max(options.length <= 3 ? options.length : 2, 1);
  const trackClass = scrollable
    ? 'flex gap-1 overflow-x-auto p-1 scrollbar-none'
    : 'grid gap-1 p-1';
  const trackStyle = scrollable
    ? undefined
    : { gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` };

  return (
    <div
      role="radiogroup"
      className={`rounded-xl border border-gray-200/90 bg-gray-100/90 dark:border-gray-700/80 dark:bg-gray-800/80 ${trackClass}`}
      style={trackStyle}
    >
      {options.map((option) => {
        const selected = value === option.id;
        const Icon = option.icon;
        if (!Icon) return null;

        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={!option.enabled}
            onClick={() => option.enabled && onChange(option.id)}
            className={`relative min-w-0 rounded-lg px-2 py-2.5 text-center transition-colors ${
              option.enabled
                ? 'text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                : 'cursor-not-allowed text-gray-400 dark:text-gray-600'
            } ${scrollable ? 'min-w-[5.5rem] shrink-0' : ''}`}
          >
            {selected ? (
              <motion.span
                layoutId={layoutId}
                transition={springTransition}
                className="absolute inset-0 rounded-lg border border-primary-200/80 bg-white shadow-sm shadow-primary-500/10 dark:border-primary-500/40 dark:bg-gray-900"
              />
            ) : null}
            <span className="relative z-10 flex flex-col items-center gap-1">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                  selected
                    ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-sm'
                    : 'bg-white/80 text-gray-500 dark:bg-gray-900/70 dark:text-gray-400'
                }`}
              >
                <Icon size={16} aria-hidden />
              </span>
              <span
                className={`line-clamp-2 text-[10px] font-semibold leading-tight ${
                  selected ? 'text-primary-900 dark:text-primary-100' : ''
                }`}
              >
                {option.label}
              </span>
              {option.recommended && recommendedLabel ? (
                <span className="rounded-full bg-primary-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-primary-700 dark:bg-primary-900/60 dark:text-primary-200">
                  {recommendedLabel}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
