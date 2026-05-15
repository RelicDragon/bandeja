import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { TRANSLATION_LANGUAGES, getTranslationLanguageFlag } from '@/utils/translationLanguages';
import { ChatAutoTranslateSlots } from './ChatAutoTranslateSlots';

export interface TranslationModalAutoTranslateProps {
  languageCodes: string[];
  maxSlots: number;
  canEdit: boolean;
  onChange: (languageCodes: string[]) => void;
}

interface TranslationLanguageModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (languageCode: string) => void;
  selectedLanguageCode: string | null;
  onRemoveLanguage?: () => void | Promise<void>;
  autoTranslate?: TranslationModalAutoTranslateProps | null;
}

export const TranslationLanguageModal: React.FC<TranslationLanguageModalProps> = ({
  open,
  onClose,
  onSelect,
  selectedLanguageCode,
  onRemoveLanguage,
  autoTranslate,
}) => {
  const { t } = useTranslation();

  const handleSelect = (code: string) => {
    onSelect(code);
    onClose();
  };

  const handleRemove = async () => {
    if (onRemoveLanguage) await onRemoveLanguage();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('chat.translationSettings', { defaultValue: 'Translation' })}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto px-2 pb-4 space-y-4">
          {autoTranslate ? (
            <section className="pb-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                {t('chat.autoTranslateTitle', { defaultValue: 'Auto-translate for this chat' })}
              </h3>
              <ChatAutoTranslateSlots
                languageCodes={autoTranslate.languageCodes}
                maxSlots={autoTranslate.maxSlots}
                canEdit={autoTranslate.canEdit}
                onChange={autoTranslate.onChange}
                compact
              />
            </section>
          ) : null}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              {t('chat.translateToLanguage', { defaultValue: 'Translate before send' })}
            </h3>
            <ul className="space-y-0.5">
              {selectedLanguageCode && onRemoveLanguage && (
                <li className="mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={handleRemove}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left font-medium bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 hover:border-red-300 dark:hover:border-red-700 transition-colors"
                  >
                    <X size={20} className="flex-shrink-0" />
                    <span>{t('chat.dontUseTranslationInThisChat', { defaultValue: "Don't use translation in this chat" })}</span>
                  </button>
                </li>
              )}
              {TRANSLATION_LANGUAGES.map(({ code, label }) => {
                const isSelected = selectedLanguageCode === code;
                return (
                  <li key={code}>
                    <button
                      type="button"
                      onClick={() => handleSelect(code)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                        isSelected
                          ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                          : 'text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      <span className="text-2xl leading-none" aria-hidden>{getTranslationLanguageFlag(code)}</span>
                      <span className="flex-1">{label}</span>
                      {isSelected && <Check size={20} className="flex-shrink-0 text-primary-600 dark:text-primary-400" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};
