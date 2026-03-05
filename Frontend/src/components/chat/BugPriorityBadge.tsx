import { useTranslation } from 'react-i18next';
import { ChevronsDown, ChevronDown, ChevronUp, ChevronsUp } from 'lucide-react';

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

const PriorityIcon = ({ priority, size = 12 }: { priority: number; size?: number }) => {
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

interface BugPriorityBadgeProps {
  priority: number;
  size?: 'sm' | 'md';
}

export const BugPriorityBadge = ({ priority, size = 'sm' }: BugPriorityBadgeProps) => {
  const { t } = useTranslation();
  const p = Math.min(2, Math.max(-2, priority));
  const iconSize = size === 'sm' ? 10 : 12;
  const textClass = size === 'sm' ? 'text-[10px]' : 'text-xs';
  const label = t(`bug.priorityLabels.${p}`, { defaultValue: `${p > 0 ? '+' : ''}${p}` });

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-medium ${textClass} ${getPriorityColor(p)}`}
      title={label}
    >
      <PriorityIcon priority={p} size={iconSize} />
      <span>{p > 0 ? `+${p}` : p}</span>
    </span>
  );
};
