import type { LucideIcon } from 'lucide-react';
import { Check } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import {
  reservationIntentExpandTransition,
  reservationIntentLayoutTransition,
  reservationIntentSpringTransition,
} from '@/components/gameLocationTime/reservationIntentMotion';

type SelectionTileProps = {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  icon?: LucideIcon;
  iconNode?: ReactNode;
  title: string;
  description?: string;
  /** Right side of the top row (e.g. duration estimate); does not share width with description. */
  topTrailing?: ReactNode;
  trailing?: ReactNode;
  badges?: ReactNode;
  className?: string;
  layout?: 'row' | 'stack';
  /** When selected, rendered inside the same card below the header (single-panel layout). */
  selectedBody?: ReactNode;
  /** Key used to crossfade animated selected-body content. */
  selectedBodyKey?: string;
  /** When set, exposes the tile as a radio option inside a radiogroup. */
  radioOption?: boolean;
};

const tileBorderClass = (selected: boolean, disabled: boolean) => {
  if (disabled) {
    return 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60 dark:border-gray-800 dark:bg-gray-900/50';
  }
  return selected
    ? 'border-primary-500 bg-gradient-to-br from-primary-50 to-white shadow-md shadow-primary-500/15 dark:from-primary-500/10 dark:to-gray-900 dark:border-primary-500'
    : 'border-gray-200 bg-white hover:border-primary-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-primary-700';
};

function SelectionTileHeader({
  selected,
  icon: Icon,
  iconNode,
  title,
  description,
  topTrailing,
  trailing,
  badges,
  layout,
  reduceMotion,
}: Omit<SelectionTileProps, 'onClick' | 'className' | 'selectedBody' | 'selectedBodyKey' | 'radioOption'> & {
  reduceMotion: boolean;
}) {
  const isStack = layout === 'stack';
  const containerClass = isStack ? 'flex-col items-center text-center' : 'items-start';
  const contentTransition = reservationIntentLayoutTransition(reduceMotion);

  return (
    <div className={`flex gap-3 ${containerClass}`}>
      {(Icon || iconNode) && (
        <motion.div
          layout={reduceMotion ? false : 'position'}
          transition={contentTransition}
          className={`flex shrink-0 items-center justify-center rounded-lg ${
            isStack ? 'h-10 w-10' : 'h-11 w-11'
          } ${
            selected
              ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-sm shadow-primary-500/25'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
          }`}
        >
          {iconNode ?? (Icon ? <Icon size={isStack ? 20 : 22} aria-hidden /> : null)}
        </motion.div>
      )}
      <div className={`min-w-0 flex-1 ${isStack ? 'w-full' : ''}`}>
        {!isStack && (badges || topTrailing) ? (
          <div className="mb-1.5 flex w-full items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap gap-1">{badges}</div>
            {topTrailing ? <div className="shrink-0">{topTrailing}</div> : null}
          </div>
        ) : isStack && badges ? (
          <div className="mb-1.5 flex flex-wrap justify-center gap-1">{badges}</div>
        ) : null}
        <div
          className={`flex gap-2 ${isStack ? 'flex-col items-center text-center' : 'items-start justify-between'}`}
        >
          <div className={`min-w-0 flex-1 ${isStack ? 'w-full' : 'w-full'}`}>
            <div className="text-sm font-semibold text-gray-900 dark:text-white">{title}</div>
          </div>
          <div className={`flex shrink-0 items-center gap-2 ${isStack ? 'justify-center' : ''}`}>
            {trailing}
            <AnimatePresence initial={false}>
              {selected ? (
                <motion.div
                  key="check"
                  initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={reduceMotion ? undefined : { scale: 0.4, opacity: 0 }}
                  transition={reservationIntentSpringTransition(reduceMotion)}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 shadow-sm"
                >
                  <Check size={14} className="text-white" strokeWidth={3} aria-hidden />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
        {description ? (
          <p
            className={`mt-1 mb-0 w-full text-[11px] leading-snug text-gray-500 dark:text-gray-400 ${
              isStack ? 'text-center' : ''
            }`}
          >
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function SelectionTile({
  selected,
  onClick,
  disabled = false,
  icon,
  iconNode,
  title,
  description,
  topTrailing,
  trailing,
  badges,
  className = '',
  layout = 'row',
  selectedBody,
  selectedBodyKey,
  radioOption = false,
}: SelectionTileProps) {
  const reduceMotion = usePrefersReducedMotion();
  const borderClass = tileBorderClass(selected, disabled);
  const expandTransition = reservationIntentExpandTransition(reduceMotion);
  const springTransition = reservationIntentSpringTransition(reduceMotion);
  const radioProps = radioOption
    ? { role: 'radio' as const, 'aria-checked': selected }
    : {};
  const headerProps = {
    selected,
    icon,
    iconNode,
    title,
    description,
    topTrailing,
    trailing,
    badges,
    layout,
    reduceMotion,
  };

  if (selected) {
    return (
      <motion.div
        layout={reduceMotion ? false : 'position'}
        transition={expandTransition}
        className={`w-full overflow-hidden rounded-xl border-2 ${borderClass} ${className}`}
      >
        <motion.button
          type="button"
          disabled={disabled}
          onClick={onClick}
          whileTap={disabled || reduceMotion ? undefined : { scale: 0.985 }}
          transition={springTransition}
          className="w-full p-3.5 text-left transition-opacity hover:opacity-95 active:opacity-90 disabled:hover:opacity-100"
          {...radioProps}
        >
          <SelectionTileHeader {...headerProps} />
        </motion.button>
        <AnimatePresence initial={false}>
          {selectedBody ? (
            <motion.div
              key={selectedBodyKey ?? 'selected-body'}
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
              transition={expandTransition}
              className="overflow-hidden border-t border-primary-200/80 dark:border-primary-500/30"
            >
              <div className="px-3.5 pb-3.5 pt-2">{selectedBody}</div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    );
  }

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      layout={reduceMotion ? false : 'position'}
      whileTap={disabled || reduceMotion ? undefined : { scale: 0.985 }}
      transition={springTransition}
      className={`w-full rounded-xl border-2 p-3.5 text-left ${borderClass} ${className}`}
      {...radioProps}
    >
      <SelectionTileHeader {...headerProps} />
    </motion.button>
  );
}
