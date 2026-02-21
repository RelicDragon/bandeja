import React from 'react';
import { Languages, Loader2 } from 'lucide-react';
import { getTranslationLanguageFlag } from '@/utils/translationLanguages';

const btnClass = 'w-11 h-11 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-[0_8px_32px_rgba(0,0,0,0.16),0_16px_64px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5),0_16px_64px_rgba(0,0,0,0.4)]';

interface TranslateToButtonProps {
  translateToLanguage: string | null;
  isTranslating: boolean;
  disabled?: boolean;
  translateDisabled?: boolean;
  onOpenModal: () => void;
  onTranslate: () => void;
}

export const TranslateToButton: React.FC<TranslateToButtonProps> = ({
  translateToLanguage,
  isTranslating,
  disabled = false,
  translateDisabled = false,
  onOpenModal,
  onTranslate,
}) => {
  const flag = translateToLanguage ? getTranslationLanguageFlag(translateToLanguage) : null;
  const translateButtonDisabled = disabled || isTranslating || translateDisabled;

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      {translateToLanguage ? (
        <>
          <button
            type="button"
            onClick={onTranslate}
            disabled={translateButtonDisabled}
            className={`${btnClass} ${isTranslating ? 'opacity-100' : ''}`}
            title="Translate message"
            aria-label="Translate message"
          >
            {isTranslating ? (
              <Loader2
                size={20}
                className="flex-shrink-0 text-primary-500 dark:text-primary-400 translate-activity-spinner"
                role="status"
                aria-label="Translating"
              />
            ) : flag ? (
              <span className="text-xl leading-none" aria-hidden>{flag}</span>
            ) : (
              <span className="text-xl leading-none" aria-hidden>{translateToLanguage}</span>
            )}
          </button>
          <button
            type="button"
            onClick={onOpenModal}
            disabled={disabled}
            className={btnClass}
            title="Select translate language"
            aria-label="Select translate language"
          >
            <Languages size={20} className="text-gray-700 dark:text-gray-300" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onOpenModal}
          disabled={disabled}
          className={btnClass}
          title="Translate"
          aria-label="Select translate language"
        >
          <Languages size={20} className="text-gray-700 dark:text-gray-300" />
        </button>
      )}
    </div>
  );
};
