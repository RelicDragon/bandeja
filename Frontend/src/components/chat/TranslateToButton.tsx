import React from 'react';
import { Languages, X } from 'lucide-react';
import { getTranslationLanguageFlag } from '@/utils/translationLanguages';

interface TranslateToButtonProps {
  translateToLanguage: string | null;
  isTranslating: boolean;
  disabled?: boolean;
  onOpenModal: () => void;
  onTranslate: () => void;
  onRemoveLanguage: () => void;
}

export const TranslateToButton: React.FC<TranslateToButtonProps> = ({
  translateToLanguage,
  isTranslating,
  disabled = false,
  onOpenModal,
  onTranslate,
  onRemoveLanguage,
}) => {
  const flag = translateToLanguage ? getTranslationLanguageFlag(translateToLanguage) : null;

  const handleClick = () => {
    if (disabled || isTranslating) return;
    if (translateToLanguage) {
      onTranslate();
    } else {
      onOpenModal();
    }
  };

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isTranslating}
        className="w-11 h-11 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
        title={translateToLanguage ? undefined : 'Translate'}
        aria-label={translateToLanguage ? 'Translate message' : 'Select translate language'}
      >
        {isTranslating ? (
          <div className="w-5 h-5 border-2 border-gray-400 dark:border-gray-500 border-t-transparent rounded-full animate-spin" />
        ) : translateToLanguage && flag ? (
          <span className="text-xl leading-none" aria-hidden>{flag}</span>
        ) : (
          <Languages size={20} className="text-gray-700 dark:text-gray-300" />
        )}
      </button>
      {translateToLanguage && !isTranslating && (
        <button
          type="button"
          onClick={onRemoveLanguage}
          disabled={disabled}
          className="w-11 h-11 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
          aria-label="Remove translate language"
        >
          <X size={20} />
        </button>
      )}
    </div>
  );
};
