import { useTranslation } from 'react-i18next';
import { ChevronsDown, ChevronDown, ChevronUp, ChevronsUp } from 'lucide-react';
import type { BugPriority } from '@/types';

const BUG_PRIORITIES: BugPriority[] = [-2, -1, 0, 1, 2];

interface BugPrioritySelectorProps {
  currentPriority: number;
  onPriorityChange: (priority: BugPriority) => void;
  disabled?: boolean;
  readonly?: boolean;
}

const getPriorityColor = (p: number) => {
  switch (p) {
    case -2:
      return 'bg-cyan-200 text-cyan-800 dark:bg-cyan-800/80 dark:text-cyan-100';
    case -1:
      return 'bg-blue-200 text-blue-800 dark:bg-blue-800/80 dark:text-blue-100';
    case 0:
      return 'bg-gray-200 text-gray-700 dark:bg-gray-600/80 dark:text-gray-100';
    case 1:
      return 'bg-orange-200 text-orange-800 dark:bg-orange-700/80 dark:text-orange-100';
    case 2:
      return 'bg-red-200 text-red-800 dark:bg-red-700/80 dark:text-red-100';
    default:
      return 'bg-gray-200 text-gray-700 dark:bg-gray-600/80 dark:text-gray-100';
  }
};

const getPriorityIconColor = (p: number) => {
  switch (p) {
    case -2:
      return 'text-cyan-800 dark:text-cyan-100';
    case -1:
      return 'text-blue-800 dark:text-blue-100';
    case 0:
      return 'text-gray-700 dark:text-gray-100';
    case 1:
      return 'text-orange-800 dark:text-orange-100';
    case 2:
      return 'text-red-800 dark:text-red-100';
    default:
      return 'text-gray-700 dark:text-gray-100';
  }
};

const PriorityIcon = ({ priority, size = 14 }: { priority: number; size?: number }) => {
  const iconColor = getPriorityIconColor(priority);
  const iconClass = `shrink-0 ${iconColor}`;
  switch (priority) {
    case -2:
      return <ChevronsDown size={size} aria-hidden className={iconClass} />;
    case -1:
      return <ChevronDown size={size} aria-hidden className={iconClass} />;
    case 0:
      return (
        <span
          className={`shrink-0 rounded-full bg-current inline-block w-1 h-1 min-w-[4px] min-h-[4px] ${iconColor}`}
          aria-hidden
        />
      );
    case 1:
      return <ChevronUp size={size} aria-hidden className={iconClass} />;
    case 2:
      return <ChevronsUp size={size} aria-hidden className={iconClass} />;
    default:
      return (
        <span
          className={`shrink-0 rounded-full bg-current inline-block w-1 h-1 min-w-[4px] min-h-[4px] ${iconColor}`}
          aria-hidden
        />
      );
  }
};

export const BugPrioritySelector = ({
  currentPriority,
  onPriorityChange,
  disabled = false,
  readonly = false
}: BugPrioritySelectorProps) => {
  const { t } = useTranslation();
  const p = Math.min(2, Math.max(-2, currentPriority));

  if (readonly) {
    const label = t(`bug.priorityLabels.${p}`, { defaultValue: String(p) });
    return (
      <div className="flex items-center gap-2">
        <span className="text-gray-500 dark:text-gray-400">{t('bug.priority', { defaultValue: 'Priority' })}:</span>
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${getPriorityColor(p)}`}
          title={label}
        >
          <PriorityIcon priority={p} />
          <span>{label}</span>
        </span>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
        {t('bug.priority', { defaultValue: 'Priority' })}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {BUG_PRIORITIES.map((priority) => {
          const active = p === priority;
          const label = t(`bug.priorityLabels.${priority}`, { defaultValue: `${priority > 0 ? '+' : ''}${priority}` });
          return (
            <button
              key={priority}
              type="button"
              onClick={() => onPriorityChange(priority)}
              disabled={disabled || active}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                active ? getPriorityColor(priority) : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              title={label}
              aria-pressed={active}
              aria-label={label}
            >
              <PriorityIcon priority={priority} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
