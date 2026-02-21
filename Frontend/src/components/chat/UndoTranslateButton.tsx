import React from 'react';
import { useTranslation } from 'react-i18next';
import { Undo2 } from 'lucide-react';

interface UndoTranslateButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export const UndoTranslateButton: React.FC<UndoTranslateButtonProps> = ({ onClick, disabled = false }) => {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
      aria-label={t('chat.undoTranslation', { defaultValue: 'Undo translation' })}
    >
      <Undo2 size={16} />
      <span>{t('common.undo', { defaultValue: 'Undo' })}</span>
    </button>
  );
};
