import React from 'react';
import { useTranslation } from 'react-i18next';
import { Undo2 } from 'lucide-react';
import { composerFabButtonClass } from './TranslateToButton';

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
      className={composerFabButtonClass}
      title={t('chat.undoTranslation', { defaultValue: 'Undo translation' })}
      aria-label={t('chat.undoTranslation', { defaultValue: 'Undo translation' })}
    >
      <Undo2 size={20} className="text-gray-700 dark:text-gray-300" />
    </button>
  );
};
