import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { TRANSLATION_LANGUAGES, getTranslationLanguageFlag } from '@/utils/translationLanguages';

interface TranslationLanguageModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (languageCode: string | null) => void;
  selectedLanguage?: string | null;
}

export const TranslationLanguageModal: React.FC<TranslationLanguageModalProps> = ({
  open,
  onClose,
  onSelect,
  selectedLanguage = null,
}) => {
  const { t } = useTranslation();
  const selected = selectedLanguage?.toLowerCase() ?? null;

  const handleSelect = (code: string | null) => {
    onSelect(code ?? null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('chat.translateToLanguage', { defaultValue: 'Translate to' })}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto p-2 -m-2">
          <ul className="space-y-0.5">
            {selected != null && (
              <li>
                <button
                  type="button"
                  onClick={() => handleSelect(null)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <X size={24} className="flex-shrink-0" />
                  <span>{t('chat.removeTranslation', { defaultValue: 'Remove translation' })}</span>
                </button>
              </li>
            )}
            {TRANSLATION_LANGUAGES.map(({ code, label }) => {
              const isSelected = selected === code.toLowerCase();
              return (
                <li key={code}>
                  <button
                    type="button"
                    onClick={() => handleSelect(code)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                      isSelected
                        ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-200 hover:bg-primary-200 dark:hover:bg-primary-900/60'
                        : 'text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <span className="text-2xl leading-none" aria-hidden>{getTranslationLanguageFlag(code)}</span>
                    <span>{label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
};
