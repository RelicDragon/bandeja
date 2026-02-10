import { useTranslation } from 'react-i18next';
import type { BugType } from '@/types';

interface BugTypeSelectorProps {
  currentType: BugType;
  onTypeChange: (type: BugType) => void;
  disabled?: boolean;
  readonly?: boolean;
}

const BUG_TYPES: BugType[] = ['BUG', 'CRITICAL', 'SUGGESTION', 'QUESTION', 'TASK'];

export const BugTypeSelector = ({
  currentType,
  onTypeChange,
  disabled = false,
  readonly = false
}: BugTypeSelectorProps) => {
  const { t } = useTranslation();

  const getTypeColor = (type: BugType) => {
    switch (type) {
      case 'CRITICAL':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
      case 'BUG':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
      case 'SUGGESTION':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      case 'QUESTION':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
      case 'TASK':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  if (readonly) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-gray-500 dark:text-gray-400">{t('bug.type')}:</span>
        <span className={`px-2 py-1 rounded-md text-xs font-medium ${getTypeColor(currentType)}`}>
          {t(`bug.types.${currentType}`)}
        </span>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
        {t('bug.type', { defaultValue: 'Type' })}
      </label>
      <div className="flex flex-wrap gap-2">
        {BUG_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => onTypeChange(type)}
            disabled={disabled || currentType === type}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              currentType === type
                ? getTypeColor(type)
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {t(`bug.types.${type}`)}
          </button>
        ))}
      </div>
    </div>
  );
};
