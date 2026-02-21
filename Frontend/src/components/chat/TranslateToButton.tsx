import React from 'react';
import { Languages, Loader2, X } from 'lucide-react';
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
        className={`w-11 h-11 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-[0_8px_32px_rgba(0,0,0,0.16),0_16px_64px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5),0_16px_64px_rgba(0,0,0,0.4)] ${isTranslating ? 'opacity-100' : 'disabled:opacity-50'}`}
        title={translateToLanguage ? undefined : 'Translate'}
        aria-label={translateToLanguage ? 'Translate message' : 'Select translate language'}
      >
        {isTranslating ? (
          <Loader2
            size={20}
            className="flex-shrink-0 text-primary-500 dark:text-primary-400 translate-activity-spinner"
            role="status"
            aria-label="Translating"
          />
        ) : translateToLanguage && flag ? (
          <span className="text-xl leading-none" aria-hidden>{flag}</span>
        ) : (
          <Languages size={20} className="text-gray-700 dark:text-gray-300" />
        )}
      </button>
      {translateToLanguage && (
        <button
          type="button"
          onClick={onRemoveLanguage}
          disabled={disabled || isTranslating}
          className="w-11 h-11 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-[0_8px_32px_rgba(0,0,0,0.16),0_16px_64px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5),0_16px_64px_rgba(0,0,0,0.4)] text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
          aria-label="Remove translate language"
        >
          <X size={20} />
        </button>
      )}
    </div>
  );
};
