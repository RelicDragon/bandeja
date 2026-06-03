import type { LucideIcon } from 'lucide-react';
import { Check } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

type SelectionTileProps = {
  selected: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  iconNode?: ReactNode;
  title: string;
  description?: string;
  trailing?: ReactNode;
  badges?: ReactNode;
  className?: string;
  layout?: 'row' | 'stack';
};

export function SelectionTile({
  selected,
  onClick,
  icon: Icon,
  iconNode,
  title,
  description,
  trailing,
  badges,
  className = '',
  layout = 'row',
}: SelectionTileProps) {
  const isStack = layout === 'stack';
  const containerClass = isStack ? 'flex-col items-center text-center' : 'items-start';

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      className={`w-full rounded-xl border-2 p-3.5 text-left transition-all duration-200 ${
        selected
          ? 'border-primary-500 bg-gradient-to-br from-primary-50 to-white shadow-md shadow-primary-500/15 dark:from-primary-500/10 dark:to-gray-900 dark:border-primary-500'
          : 'border-gray-200 bg-white hover:border-primary-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-primary-700'
      } ${className}`}
    >
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
          <div className={`flex gap-2 ${isStack ? 'flex-col items-center text-center' : 'items-start justify-between'}`}>
            <div className="min-w-0 flex-1">
              {badges ? <div className="mb-1.5 flex flex-wrap gap-1">{badges}</div> : null}
              <div className="text-sm font-semibold text-gray-900 dark:text-white">{title}</div>
              {description ? (
                <p className="mt-1 mb-0 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                  {description}
                </p>
              ) : null}
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
        </div>
      </div>
    </motion.button>
  );
}
