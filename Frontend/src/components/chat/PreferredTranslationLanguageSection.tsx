import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown } from 'lucide-react';
import { TRANSLATION_LANGUAGES, getTranslationLanguageByCode, getTranslationLanguageFlag } from '@/utils/translationLanguages';

interface PreferredTranslationLanguageSectionProps {
  preferredLanguageCode: string | null;
  appLanguageCode: string;
  modalOpen: boolean;
  onChange: (languageCode: string | null) => void | Promise<void>;
}

export const PreferredTranslationLanguageSection: React.FC<PreferredTranslationLanguageSectionProps> = ({
  preferredLanguageCode,
  appLanguageCode,
  modalOpen,
  onChange,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!modalOpen) {
      setOpen(false);
    }
  }, [modalOpen]);

  const normalizedPreferred = preferredLanguageCode?.toLowerCase() ?? null;

  const effectiveCode = normalizedPreferred ?? appLanguageCode;
  const effectiveEntry = getTranslationLanguageByCode(effectiveCode);
  const effectiveLabel = effectiveEntry?.label ?? effectiveCode;
  const isUsingAppDefault = !normalizedPreferred;

  const handleSelect = async (code: string | null) => {
    await onChange(code);
    setOpen(false);
  };

  return (
    <section className="pb-4 border-b border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
        {t('chat.preferredTranslationTitle', { defaultValue: 'Translate incoming messages to' })}
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        {t('chat.preferredTranslationHint', {
          defaultValue: 'When you tap Translate on a message, it will appear in this language.',
        })}
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-expanded={open}
      >
        <span className="text-2xl leading-none" aria-hidden>
          {getTranslationLanguageFlag(effectiveCode)}
        </span>
        <span className="flex-1 min-w-0">
          {isUsingAppDefault
            ? t('chat.preferredTranslationAppLanguage', {
                defaultValue: 'App language ({{language}})',
                language: effectiveLabel,
              })
            : effectiveLabel}
        </span>
        <ChevronDown
          size={18}
          className={`flex-shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open ? (
        <ul className="mt-2 max-h-48 overflow-y-auto space-y-0.5 rounded-lg border border-gray-200 dark:border-gray-700 p-1">
          <li>
            <button
              type="button"
              onClick={() => void handleSelect(null)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                isUsingAppDefault
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                  : 'text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <span className="text-xl leading-none" aria-hidden>
                {getTranslationLanguageFlag(appLanguageCode)}
              </span>
              <span className="flex-1">
                {t('chat.preferredTranslationAppLanguage', {
                  defaultValue: 'App language ({{language}})',
                  language: getTranslationLanguageByCode(appLanguageCode)?.label ?? appLanguageCode,
                })}
              </span>
              {isUsingAppDefault ? (
                <Check size={18} className="flex-shrink-0 text-primary-600 dark:text-primary-400" aria-hidden />
              ) : null}
            </button>
          </li>
          {TRANSLATION_LANGUAGES.map(({ code, label }) => {
            const isSelected = normalizedPreferred === code;
            return (
              <li key={code}>
                <button
                  type="button"
                  onClick={() => void handleSelect(code)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                    isSelected
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <span className="text-xl leading-none" aria-hidden>
                    {getTranslationLanguageFlag(code)}
                  </span>
                  <span className="flex-1">{label}</span>
                  {isSelected ? (
                    <Check size={18} className="flex-shrink-0 text-primary-600 dark:text-primary-400" aria-hidden />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
};
