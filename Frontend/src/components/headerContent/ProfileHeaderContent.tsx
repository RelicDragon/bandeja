import { Edit3, Save, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ProfileHeaderContentProps {
  isEditMode: boolean;
  onEditModeToggle: () => void;
  onSaveChanges: () => void;
  disabled?: boolean;
}

export const ProfileHeaderContent = ({
  isEditMode,
  onEditModeToggle,
  onSaveChanges,
  disabled = false
}: ProfileHeaderContentProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onEditModeToggle}
        className={`px-3 py-2 rounded-lg transition-all duration-300 ease-in-out shadow-sm hover:shadow-md flex items-center gap-2 ${
          isEditMode
            ? 'bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 shadow-red-100 dark:shadow-red-900/20 translate-x-0'
            : 'bg-primary-600 hover:bg-primary-700 text-white border border-primary-600 shadow-primary-100 dark:shadow-primary-900/20 translate-x-10'
        }`}
        title={isEditMode ? t('common.cancel') : t('common.edit')}
      >
        <div className="relative w-[18px] h-[18px]">
          <X
            size={18}
            className={`absolute inset-0 transition-all duration-300 ease-in-out ${
              isEditMode
                ? 'opacity-100 rotate-0 scale-100 text-red-600 dark:text-red-400'
                : 'opacity-0 rotate-90 scale-75'
            }`}
          />
          <Edit3
            size={18}
            className={`absolute inset-0 transition-all duration-300 ease-in-out ${
              isEditMode
                ? 'opacity-0 -rotate-90 scale-75'
                : 'opacity-100 rotate-0 scale-100 text-white'
            }`}
          />
        </div>
        <span className={`text-sm font-medium transition-all duration-300 ease-in-out ${
          isEditMode
            ? 'text-red-600 dark:text-red-400'
            : 'text-white'
        }`}>
          {isEditMode ? t('common.cancel') : t('common.edit')}
        </span>
      </button>
      
      <button
        onClick={onSaveChanges}
        className={`p-2 rounded-lg transition-all duration-300 ease-in-out shadow-sm hover:shadow-md shadow-green-200 dark:shadow-green-900/30 ${
          isEditMode 
            ? 'bg-green-600 hover:bg-green-700 opacity-100 scale-100 translate-x-0' 
            : 'bg-green-600 hover:bg-green-700 opacity-0 scale-75 pointer-events-none -translate-x-10'
        }`}
        title={t('common.save')}
        disabled={!isEditMode || disabled}
      >
        <Save size={18} className="text-white" />
      </button>
    </div>
  );
};
