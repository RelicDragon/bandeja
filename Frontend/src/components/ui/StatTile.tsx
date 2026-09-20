import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type StatTileTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

export interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: LucideIcon;
  tone?: StatTileTone;
  className?: string;
}

const VALUE_TONE: Record<StatTileTone, string> = {
  neutral: 'text-gray-900 dark:text-white',
  primary: 'text-primary-600 dark:text-primary-400',
  success: 'text-green-600 dark:text-green-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
};

const ICON_TONE: Record<StatTileTone, string> = {
  neutral: 'text-gray-400 dark:text-gray-500',
  primary: 'text-primary-500 dark:text-primary-400',
  success: 'text-green-500 dark:text-green-400',
  warning: 'text-amber-500 dark:text-amber-400',
  danger: 'text-red-500 dark:text-red-400',
};

/**
 * One cell of the house stat band (see `LevelHistoryProfileStatsSection` for the
 * original ad-hoc version). Draws no surface of its own so a `StatTileRow` can
 * own the rounded container and the hairline dividers; standalone use inherits
 * whatever surface it is dropped on.
 *
 * Label and value are both plain text, so a screen reader reads "Games 42".
 * Only logical spacing utilities are used, so `ar` (RTL) mirrors correctly.
 */
export const StatTile = ({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  className = '',
}: StatTileProps) => {
  return (
    <div
      className={`flex min-w-0 flex-col items-center justify-center gap-0.5 px-2 py-2.5 text-center ${className}`.trim()}
    >
      {Icon ? <Icon className={`h-4 w-4 ${ICON_TONE[tone]}`} strokeWidth={1.75} aria-hidden /> : null}
      <span className="max-w-full truncate text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`text-base font-semibold tabular-nums ${VALUE_TONE[tone]}`}>{value}</span>
      {hint ? (
        <span className="max-w-full text-[11px] leading-snug text-gray-400 dark:text-gray-500">{hint}</span>
      ) : null}
    </div>
  );
};
