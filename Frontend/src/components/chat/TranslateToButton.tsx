import React from 'react';
import { Languages, Loader2 } from 'lucide-react';

interface TranslateToButtonProps {
  isTranslating: boolean;
  disabled?: boolean;
  onOpenModal: () => void;
}

export const TranslateToButton: React.FC<TranslateToButtonProps> = ({
  isTranslating,
  disabled = false,
  onOpenModal,
}) => {
  return (
    <div className="flex-shrink-0">
      <button
        type="button"
        onClick={onOpenModal}
        disabled={disabled || isTranslating}
        className={`w-11 h-11 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-[0_8px_32px_rgba(0,0,0,0.16),0_16px_64px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5),0_16px_64px_rgba(0,0,0,0.4)] ${isTranslating ? 'opacity-100' : 'disabled:opacity-50'}`}
        title="Translate"
        aria-label="Select translate language"
      >
        {isTranslating ? (
          <Loader2
            size={20}
            className="flex-shrink-0 text-primary-500 dark:text-primary-400 translate-activity-spinner"
            role="status"
            aria-label="Translating"
          />
        ) : (
          <Languages size={20} className="text-gray-700 dark:text-gray-300" />
        )}
      </button>
    </div>
  );
};
