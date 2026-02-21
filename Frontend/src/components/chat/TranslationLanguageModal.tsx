import React from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { TRANSLATION_LANGUAGES, getTranslationLanguageFlag } from '@/utils/translationLanguages';

interface TranslationLanguageModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (languageCode: string) => void;
}

export const TranslationLanguageModal: React.FC<TranslationLanguageModalProps> = ({
  open,
  onClose,
  onSelect,
}) => {
  const { t } = useTranslation();

  const handleSelect = (code: string) => {
    onSelect(code);
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
            {TRANSLATION_LANGUAGES.map(({ code, label }) => (
              <li key={code}>
                <button
                  type="button"
                  onClick={() => handleSelect(code)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <span className="text-2xl leading-none" aria-hidden>{getTranslationLanguageFlag(code)}</span>
                  <span>{label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
};
