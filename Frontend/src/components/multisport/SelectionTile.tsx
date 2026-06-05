import type { LucideIcon } from 'lucide-react';
import { Check } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';

type SelectionTileProps = {
  selected: boolean;
  onClick: () => void;
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
};

const tileBorderClass = (selected: boolean) =>
  selected
    ? 'border-primary-500 bg-gradient-to-br from-primary-50 to-white shadow-md shadow-primary-500/15 dark:from-primary-500/10 dark:to-gray-900 dark:border-primary-500'
    : 'border-gray-200 bg-white hover:border-primary-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-primary-700';

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
}: Omit<SelectionTileProps, 'onClick' | 'className' | 'selectedBody'>) {
  const isStack = layout === 'stack';
  const containerClass = isStack ? 'flex-col items-center text-center' : 'items-start';

  return (
    <div className={`flex gap-3 ${containerClass}`}>
      {(Icon || iconNode) && (
        <div
          className={`flex shrink-0 items-center justify-center rounded-lg transition-colors ${
            isStack ? 'h-10 w-10' : 'h-11 w-11'
          } ${
            selected
              ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
          }`}
        >
          {iconNode ?? (Icon ? <Icon size={isStack ? 20 : 22} aria-hidden /> : null)}
        </div>
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
            {selected ? (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 shadow-sm"
              >
                <Check size={14} className="text-white" strokeWidth={3} aria-hidden />
              </motion.div>
            ) : null}
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
}: SelectionTileProps) {
  const singlePanel = selected && selectedBody != null;
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
  };

  if (singlePanel) {
    return (
      <motion.div
        layout="position"
        className={`w-full overflow-hidden rounded-xl border-2 transition-all duration-200 ${tileBorderClass(selected)} ${className}`}
      >
        <motion.button
          type="button"
          onClick={onClick}
          whileTap={{ scale: 0.98 }}
          className="w-full p-3.5 text-left transition-opacity hover:opacity-95 active:opacity-90"
        >
          <SelectionTileHeader {...headerProps} />
        </motion.button>
        <div
          className="border-t border-primary-200/80 px-3.5 pb-3.5 pt-2 dark:border-primary-500/30"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <AnimatePresence initial={false}>
            <motion.div
              key="selected-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              {selectedBody}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      className={`w-full rounded-xl border-2 p-3.5 text-left transition-all duration-200 ${tileBorderClass(selected)} ${className}`}
    >
      <SelectionTileHeader {...headerProps} />
    </motion.button>
  );
}
