import { useTranslation } from 'react-i18next';
import type { BugStatus } from '@/types';

interface BugStatusSelectorProps {
  currentStatus: BugStatus;
  onStatusChange: (status: BugStatus) => void;
  disabled?: boolean;
  readonly?: boolean;
}

const BUG_STATUSES: BugStatus[] = ['CREATED', 'CONFIRMED', 'IN_PROGRESS', 'TEST', 'FINISHED', 'ARCHIVED'];

export const BugStatusSelector = ({
  currentStatus,
  onStatusChange,
  disabled = false,
  readonly = false
}: BugStatusSelectorProps) => {
  const { t } = useTranslation();

  const getStatusColor = (status: BugStatus) => {
    switch (status) {
      case 'CREATED':
        return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
      case 'CONFIRMED':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      case 'IN_PROGRESS':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'TEST':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
      case 'FINISHED':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
      case 'ARCHIVED':
        return 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  if (readonly) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-gray-500 dark:text-gray-400">{t('bug.status')}:</span>
        <span className={`px-2 py-1 rounded-md text-xs font-medium ${getStatusColor(currentStatus)}`}>
          {t(`bug.statuses.${currentStatus}`)}
        </span>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
        {t('bug.status', { defaultValue: 'Status' })}
      </label>
      <div className="flex flex-wrap gap-2">
        {BUG_STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => onStatusChange(status)}
            disabled={disabled || currentStatus === status}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              currentStatus === status
                ? getStatusColor(status)
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {t(`bug.statuses.${status}`)}
          </button>
        ))}
      </div>
    </div>
  );
};
