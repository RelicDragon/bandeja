import React from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { CHAT_PANEL_TRANSITION } from '@/components/chat/chatListMotion';
import { ChatAutoTranslateSlots } from './ChatAutoTranslateSlots';

interface ChatAutoTranslateSlotsSheetProps {
  open: boolean;
  onClose: () => void;
  languageCodes: string[];
  maxSlots: number;
  canEdit: boolean;
  onChange: (languageCodes: string[]) => void;
}

export const ChatAutoTranslateSlotsSheet: React.FC<ChatAutoTranslateSlotsSheetProps> = ({
  open,
  onClose,
  languageCodes,
  maxSlots,
  canEdit,
  onChange,
}) => {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const panelTransition = reduceMotion ? { duration: 0 } : CHAT_PANEL_TRANSITION;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="auto-translate-sheet"
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={panelTransition}
        >
          <motion.button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label={t('common.close', { defaultValue: 'Close' })}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={panelTransition}
          />
          <motion.div
            className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl p-5 max-h-[85vh] overflow-y-auto"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={panelTransition}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('chat.autoTranslateTitle', { defaultValue: 'Auto-translate for this chat' })}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X size={20} />
              </button>
            </div>
            <ChatAutoTranslateSlots
              languageCodes={languageCodes}
              maxSlots={maxSlots}
              canEdit={canEdit}
              onChange={onChange}
            />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
