import { useCallback, useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { reservationIntentSpringTransition } from './reservationIntentMotion';
import { splitChipLabel } from './splitChipLabel';

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

function ChipLabel({ label, selected }: { label: string; selected: boolean }) {
  const { first, second } = splitChipLabel(label);
  const textClass = selected ? 'text-primary-900 dark:text-primary-100' : '';

  if (!second) {
    return (
      <span
        className={`max-w-full px-0.5 text-center text-[10px] font-semibold leading-tight sm:text-xs ${textClass}`}
      >
        {first}
      </span>
    );
  }

  return (
    <span
      className={`flex max-w-full flex-col items-center px-0.5 text-center text-[10px] font-semibold leading-[1.15] sm:text-xs ${textClass}`}
    >
      <span className="max-w-full break-words [overflow-wrap:anywhere]">{first}</span>
      <span className="max-w-full break-words [overflow-wrap:anywhere]">{second}</span>
    </span>
  );
}

function resolveGridColsClass(optionCount: number, scrollable: boolean): string {
  if (optionCount <= 2) return 'grid-cols-2';
  if (scrollable && optionCount > 4) return 'grid-cols-2 lg:grid-cols-3';
  if (optionCount === 3) return 'grid-cols-3';
  if (optionCount === 4) return 'grid-cols-2 md:grid-cols-4';
  return 'grid-cols-2';
}

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
  const trackRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<T, HTMLButtonElement>());

  const useHorizontalScroll = scrollable && options.length > 3;
  const gridColsClass = resolveGridColsClass(options.length, scrollable);

  const scrollOptionIntoView = useCallback(
    (id: T) => {
      if (!useHorizontalScroll) return;
      const button = buttonRefs.current.get(id);
      const track = trackRef.current;
      if (!button || !track) return;
      if (track.scrollWidth <= track.clientWidth + 1) return;

      button.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        inline: 'nearest',
        block: 'nearest',
      });
    },
    [reduceMotion, useHorizontalScroll],
  );

  useEffect(() => {
    scrollOptionIntoView(value);
  }, [value, scrollOptionIntoView]);

  const handleSelect = useCallback(
    (id: T, enabled: boolean) => {
      if (!enabled) return;
      onChange(id);
      scrollOptionIntoView(id);
    },
    [onChange, scrollOptionIntoView],
  );

  const trackClass = useHorizontalScroll
    ? `flex gap-0.5 overflow-x-auto p-0.5 scrollbar-none snap-x snap-mandatory ${gridColsClass} sm:grid sm:overflow-visible sm:snap-none`
    : `grid gap-0.5 p-0.5 ${gridColsClass}`;

  const buttonWidthClass = useHorizontalScroll
    ? 'min-w-[5.5rem] shrink-0 snap-center sm:w-full sm:min-w-0 sm:shrink'
    : 'min-w-0 w-full';

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      className={`rounded-lg border border-gray-200/90 bg-gray-100/90 dark:border-gray-700/80 dark:bg-gray-800/80 sm:rounded-xl ${trackClass}`}
    >
      {options.map((option) => {
        const selected = value === option.id;
        const Icon = option.icon;
        if (!Icon) return null;

        return (
          <button
            key={option.id}
            ref={(el) => {
              if (el) buttonRefs.current.set(option.id, el);
              else buttonRefs.current.delete(option.id);
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={!option.enabled}
            onClick={() => handleSelect(option.id, option.enabled)}
            className={`relative rounded-md px-1 py-1.5 text-center transition-colors sm:rounded-lg sm:px-2 sm:py-2.5 ${buttonWidthClass} ${
              option.enabled
                ? 'text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                : 'cursor-not-allowed text-gray-400 dark:text-gray-600'
            }`}
          >
            {selected ? (
              <motion.span
                layoutId={layoutId}
                transition={springTransition}
                className="absolute inset-0 rounded-md border border-primary-200/80 bg-white shadow-sm shadow-primary-500/10 dark:border-primary-500/40 dark:bg-gray-900 sm:rounded-lg"
              />
            ) : null}
            <span className="relative z-10 flex flex-col items-center gap-0.5 sm:gap-1">
              <span
                className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors sm:h-8 sm:w-8 sm:rounded-lg ${
                  selected
                    ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-sm'
                    : 'bg-white/80 text-gray-500 dark:bg-gray-900/70 dark:text-gray-400'
                }`}
              >
                {option.recommended && recommendedLabel ? (
                  <span className="pointer-events-none absolute -top-1 -right-2 truncate rounded-full bg-primary-500 px-1 py-px text-[6px] font-bold uppercase leading-none tracking-wide text-white sm:text-[7px]">
                    {recommendedLabel}
                  </span>
                ) : null}
                <Icon size={15} aria-hidden />
              </span>
              <ChipLabel label={option.label} selected={selected} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
