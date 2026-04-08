import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { usePlayersStore } from '@/store/playersStore';
import type { BasicUser } from '@/types';

function formatUserName(u: BasicUser | undefined): string {
  if (!u) return '';
  const n = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return n || '';
}

export interface TypingIndicatorProps {
  typingUserIds: string[];
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ typingUserIds }) => {
  const { t } = useTranslation();
  const getUser = usePlayersStore((s) => s.getUser);

  const label = useMemo(() => {
    if (typingUserIds.length === 0) return '';
    const names = typingUserIds.map((id) => {
      const n = formatUserName(getUser(id));
      return n || t('chat.typingSomeone', { defaultValue: 'Someone' });
    });
    if (names.length === 1) {
      return t('chat.typingOne', { name: names[0], defaultValue: '{{name}} is typing…' });
    }
    if (names.length === 2) {
      return t('chat.typingTwo', {
        name1: names[0],
        name2: names[1],
        defaultValue: '{{name1}} and {{name2}} are typing…',
      });
    }
    return t('chat.typingMany', { count: names.length, defaultValue: '{{count}} people are typing…' });
  }, [typingUserIds, getUser, t]);

  return (
    <AnimatePresence initial={false}>
      {typingUserIds.length > 0 && (
        <motion.div
          key="typing"
          role="status"
          aria-live="polite"
          aria-relevant="additions text"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden px-1"
        >
          <div className="flex items-center gap-2 min-h-[22px] text-xs text-gray-500 dark:text-gray-400 mb-1.5">
            <span className="flex gap-0.5 items-center shrink-0" aria-hidden>
              <span className="inline-block w-1 h-1 rounded-full bg-current typing-dot" />
              <span className="inline-block w-1 h-1 rounded-full bg-current typing-dot typing-dot-delay-1" />
              <span className="inline-block w-1 h-1 rounded-full bg-current typing-dot typing-dot-delay-2" />
            </span>
            <span className="truncate">{label}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
