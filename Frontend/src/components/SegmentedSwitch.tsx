import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UnreadBadge } from '@/components/UnreadBadge';

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

interface SegmentedSwitchBaseProps {
  tabs: SegmentedSwitchTab[];
  showOnlyActiveTabText: boolean;
  layoutId: string;
  className?: string;
  disabled?: boolean;
  /** Accessible name for the tab list. */
  ariaLabel?: string;
  /** Stack options vertically (full-width rows). Default horizontal. */
  orientation?: 'horizontal' | 'vertical';
  /** Max animated width (px) for active tab label when showOnlyActiveTabText. Default 96. */
  activeLabelMaxWidth?: number;
  /** `notification`: red corner badge (default). `inline`: gray pill on the same row as label/icon. */
  badgeStyle?: 'notification' | 'inline';
  /** Stretch container to full width with equal-width tabs (horizontal only). */
  fullWidth?: boolean;
}

type SegmentedSwitchProps = SegmentedSwitchBaseProps &
  (
    | { allowDeselect?: false; activeId: string; onChange: (id: string) => void }
    | { allowDeselect: true; activeId: string | null; onChange: (id: string | null) => void }
  );

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
  activeLabelMaxWidth = 96,
  allowDeselect = false,
  badgeStyle = 'notification',
  fullWidth = false,
}: SegmentedSwitchProps) => {
  const isVertical = orientation === 'vertical';

  const handleTabClick = (tabId: string, tabDisabled?: boolean) => {
    if (disabled || tabDisabled) return;
    if (allowDeselect && activeId === tabId) {
      (onChange as (id: string | null) => void)(null);
      return;
    }
    onChange(tabId);
  };
  return (
  <div
    role="tablist"
    aria-label={ariaLabel}
    aria-orientation={isVertical ? 'vertical' : 'horizontal'}
    className={`relative flex items-stretch gap-1 overflow-visible rounded-lg bg-gray-100 p-1 dark:bg-gray-700 ${
      isVertical ? 'w-full flex-col' : fullWidth ? 'w-full' : 'w-fit'
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
          onClick={() => handleTabClick(tab.id, tab.disabled)}
          className={`relative flex min-w-0 items-center rounded-md py-2.5 text-sm font-medium transition-colors duration-200 ${
            isVertical ? 'w-full justify-start gap-2.5 text-left' : 'justify-center gap-1.5'
          } ${!isVertical && fullWidth ? 'flex-1' : ''} ${pad} ${
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
                    animate={isVertical ? { opacity: 1 } : { maxWidth: activeLabelMaxWidth, opacity: 1 }}
                    exit={isVertical ? { opacity: 0 } : { maxWidth: 0, opacity: 0 }}
                    transition={{ type: 'tween', duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                    className={isVertical ? '' : 'overflow-hidden whitespace-nowrap'}
                  >
                    {tab.label}
                  </motion.span>
                )}
              </AnimatePresence>
            ) : (
              <span className={isVertical ? '' : 'truncate whitespace-nowrap'}>{tab.label}</span>
            )}
            {badgeStyle === 'inline' && tab.badge != null && tab.badge > 0 ? (
              <span
                className={`relative z-[1] inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
                  isActive
                    ? 'bg-gray-900/10 text-gray-800 dark:bg-white/15 dark:text-gray-200'
                    : 'bg-gray-900/5 text-gray-600 dark:bg-white/10 dark:text-gray-300'
                }`}
              >
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            ) : null}
          </span>
          {badgeStyle === 'notification' && tab.badge != null ? (
            <UnreadBadge count={tab.badge} size="sm" className="absolute -top-1 -right-1" />
          ) : null}
        </motion.button>
      );
    })}
  </div>
  );
};
