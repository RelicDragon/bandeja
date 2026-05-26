import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type SegmentedSwitchIcon = LucideIcon | ComponentType<{ size?: number; className?: string }>;

export interface SegmentedSwitchTab {
  id: string;
  label: string;
  icon?: SegmentedSwitchIcon;
  badge?: number;
  ariaLabel?: string;
  disabled?: boolean;
  /** Shown when tab is disabled (native tooltip). */
  title?: string;
}

interface SegmentedSwitchProps {
  tabs: SegmentedSwitchTab[];
  activeId: string;
  onChange: (id: string) => void;
  showOnlyActiveTabText: boolean;
  layoutId: string;
  className?: string;
  disabled?: boolean;
  /** Accessible name for the tab list. */
  ariaLabel?: string;
  /** Stack options vertically (full-width rows). Default horizontal. */
  orientation?: 'horizontal' | 'vertical';
}

export const SegmentedSwitch = ({
  tabs,
  activeId,
  onChange,
  showOnlyActiveTabText,
  layoutId,
  className = '',
  disabled = false,
  ariaLabel,
  orientation = 'horizontal',
}: SegmentedSwitchProps) => {
  const isVertical = orientation === 'vertical';
  return (
  <div
    role="tablist"
    aria-label={ariaLabel}
    aria-orientation={isVertical ? 'vertical' : 'horizontal'}
    className={`relative mx-auto flex items-stretch gap-1 overflow-visible rounded-lg bg-gray-100 p-1 dark:bg-gray-700 ${
      isVertical ? 'w-full flex-col' : 'w-fit'
    } ${className}`.trim()}
  >
    {tabs.map((tab) => {
      const isActive = activeId === tab.id;
      const Icon = tab.icon;
      const showLabel = !showOnlyActiveTabText || isActive;
      const pad = showOnlyActiveTabText && !isActive ? 'px-2' : 'px-3';
      return (
        <motion.button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={isActive}
          disabled={disabled || tab.disabled}
          title={tab.disabled ? tab.title : undefined}
          onClick={() => {
            if (!disabled && !tab.disabled) onChange(tab.id);
          }}
          className={`relative flex min-w-0 items-center rounded-md py-2.5 text-sm font-medium transition-colors duration-200 ${
            isVertical ? 'w-full justify-start gap-2.5 text-left' : 'justify-center gap-1.5'
          } ${pad} ${
            disabled || tab.disabled
              ? 'cursor-not-allowed opacity-50'
              : isActive
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
          whileTap={disabled || tab.disabled ? undefined : { scale: 0.95 }}
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
          {isVertical && (
            <span
              className={`relative z-[1] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                isActive
                  ? 'border-primary-500 dark:border-primary-400'
                  : 'border-gray-400 dark:border-gray-500'
              }`}
              aria-hidden
            >
              {isActive && (
                <span className="h-2 w-2 rounded-full bg-primary-500 dark:bg-primary-400" />
              )}
            </span>
          )}
          <span
            className={`relative flex min-w-0 items-center gap-1.5 ${
              isVertical ? 'justify-start' : 'justify-center'
            }`}
          >
            {Icon && <Icon size={18} className="shrink-0" />}
            {showOnlyActiveTabText ? (
              <AnimatePresence initial={false}>
                {showLabel && (
                  <motion.span
                    initial={isVertical ? { opacity: 0 } : { maxWidth: 0, opacity: 0 }}
                    animate={isVertical ? { opacity: 1 } : { maxWidth: 96, opacity: 1 }}
                    exit={isVertical ? { opacity: 0 } : { maxWidth: 0, opacity: 0 }}
                    transition={{ type: 'tween', duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                    className={isVertical ? '' : 'overflow-hidden truncate whitespace-nowrap'}
                  >
                    {tab.label}
                  </motion.span>
                )}
              </AnimatePresence>
            ) : (
              <span className={isVertical ? '' : 'truncate whitespace-nowrap'}>{tab.label}</span>
            )}
          </span>
          {tab.badge !== undefined && tab.badge > 0 && (
            <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-medium text-white">
              {tab.badge > 99 ? '99+' : tab.badge}
            </span>
          )}
        </motion.button>
      );
    })}
  </div>
  );
};
