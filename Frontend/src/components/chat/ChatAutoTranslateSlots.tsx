import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import { TranslationLanguageModal } from './TranslationLanguageModal';
import { getTranslationLanguageFlag, getTranslationLanguageByCode } from '@/utils/translationLanguages';

export interface ChatAutoTranslateSlotsProps {
  languageCodes: string[];
  maxSlots: number;
  canEdit: boolean;
  onChange: (languageCodes: string[]) => void;
  compact?: boolean;
}

const SLOT_COUNT = 3;

export const ChatAutoTranslateSlots: React.FC<ChatAutoTranslateSlotsProps> = ({
  languageCodes,
  maxSlots,
  canEdit,
  onChange,
  compact = false,
}) => {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const slots: (string | null)[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    if (i < maxSlots) {
      slots.push(languageCodes[i] ?? null);
    } else {
      slots.push(null);
    }
  }

  const handleSelect = (code: string) => {
    if (editingIndex === null) return;
    const next = [...languageCodes];
    const existingIdx = next.indexOf(code);
    if (existingIdx >= 0 && existingIdx !== editingIndex) {
      next.splice(existingIdx, 1);
    }
    while (next.length <= editingIndex) next.push('');
    next[editingIndex] = code;
    onChange(next.filter(Boolean));
    setEditingIndex(null);
  };

  const clearSlot = (index: number) => {
    onChange(languageCodes.filter((_, i) => i !== index));
  };

  const slotSize = compact ? 'w-14 h-14' : 'w-16 h-16';

  return (
    <motion.div className="space-y-2">
      <p className={`text-gray-600 dark:text-gray-400 ${compact ? 'text-xs' : 'text-sm'}`}>
        {t('chat.autoTranslateHint', {
          defaultValue:
            'Messages are translated for members whose app language matches a slot below.',
        })}
      </p>
      <motion.div className="flex flex-wrap justify-center gap-3" layout>
        {slots.map((code, index) => {
          const disabled = index >= maxSlots;
          if (disabled) {
            return (
              <motion.div
                key={`ghost-${index}`}
                className={`${slotSize} rounded-xl border border-dashed border-gray-200 dark:border-gray-700 opacity-30`}
                aria-hidden
              />
            );
          }
          if (code) {
            const label = getTranslationLanguageByCode(code)?.label ?? code.toUpperCase();
            return (
              <motion.div key={`${code}-${index}`} className="flex flex-col items-center gap-1" layout>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => {
                    if (!canEdit) return;
                    setEditingIndex(index);
                    setPickerOpen(true);
                  }}
                  className={`${slotSize} rounded-xl border border-primary-300 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/30 flex flex-col items-center justify-center gap-0.5 ${
                    canEdit ? 'hover:bg-primary-100 dark:hover:bg-primary-900/50' : ''
                  }`}
                  title={label}
                >
                  <span className="text-2xl leading-none" aria-hidden>
                    {getTranslationLanguageFlag(code)}
                  </span>
                  <span className="text-[10px] font-semibold uppercase text-primary-700 dark:text-primary-300">
                    {code}
                  </span>
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => clearSlot(index)}
                    className="text-gray-400 hover:text-red-500 p-0.5"
                    aria-label={t('chat.autoTranslateRemoveSlot', { defaultValue: 'Remove language' })}
                  >
                    <X size={14} />
                  </button>
                )}
              </motion.div>
            );
          }
          return (
            <button
              key={`empty-${index}`}
              type="button"
              disabled={!canEdit}
              onClick={() => {
                setEditingIndex(index);
                setPickerOpen(true);
              }}
              className={`${slotSize} rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-1 text-gray-400 ${
                canEdit ? 'hover:border-primary-400 hover:text-primary-500' : 'opacity-60'
              }`}
            >
              <Plus size={compact ? 18 : 22} />
              <span className="text-[10px] font-medium">
                {t('chat.autoTranslateAddLanguage', { defaultValue: 'Add' })}
              </span>
            </button>
          );
        })}
      </motion.div>
      {!canEdit && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('chat.autoTranslateReadOnly', {
            defaultValue: 'Only chat admins can change auto-translate languages.',
          })}
        </p>
      )}
      <TranslationLanguageModal
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setEditingIndex(null);
        }}
        onSelect={handleSelect}
        selectedLanguageCode={
          editingIndex != null ? languageCodes[editingIndex] ?? null : null
        }
      />
    </motion.div>
  );
};
