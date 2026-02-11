import { LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface SegmentedSwitchTab {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: number;
  ariaLabel?: string;
}

interface SegmentedSwitchProps {
  tabs: SegmentedSwitchTab[];
  activeId: string;
  onChange: (id: string) => void;
  titleInActiveOnly: boolean;
  layoutId: string;
  className?: string;
}

export const SegmentedSwitch = ({
  tabs,
  activeId,
  onChange,
  titleInActiveOnly,
  layoutId,
  className = '',
}: SegmentedSwitchProps) => (
  <div className={`relative flex items-center gap-1 overflow-visible bg-gray-100 dark:bg-gray-700 rounded-lg p-1 ${className}`.trim()}>
    {tabs.map((tab) => {
      const isActive = activeId === tab.id;
      const Icon = tab.icon;
      const showLabel = !titleInActiveOnly || isActive;
      return (
        <motion.button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`relative flex items-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors duration-200 ${
            titleInActiveOnly && !isActive ? 'px-2' : 'px-3'
          } ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
          whileTap={{ scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          layout
          aria-label={tab.ariaLabel ?? tab.label}
        >
          {isActive && (
            <motion.div
              className="absolute inset-0 rounded-md bg-primary-500/15 dark:bg-primary-400/15 ring-1 ring-primary-500/30 dark:ring-primary-400/30"
              layoutId={layoutId}
              initial={false}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          )}
          <span className="relative flex items-center gap-1.5 shrink-0">
            {Icon && <Icon size={18} />}
            {titleInActiveOnly ? (
              <AnimatePresence initial={false}>
                {showLabel && (
                  <motion.span
                    initial={{ maxWidth: 0, opacity: 0 }}
                    animate={{ maxWidth: 96, opacity: 1 }}
                    exit={{ maxWidth: 0, opacity: 0 }}
                    transition={{ type: 'tween', duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                    className="overflow-hidden whitespace-nowrap"
                  >
                    {tab.label}
                  </motion.span>
                )}
              </AnimatePresence>
            ) : (
              <span className="whitespace-nowrap">{tab.label}</span>
            )}
          </span>
          {tab.badge !== undefined && tab.badge > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-medium">
              {tab.badge > 99 ? '99+' : tab.badge}
            </span>
          )}
        </motion.button>
      );
    })}
  </div>
);
