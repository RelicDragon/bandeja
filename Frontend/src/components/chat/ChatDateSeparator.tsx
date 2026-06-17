import React from 'react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { CHAT_LIST_FADE_TRANSITION_S } from '@/components/chat/chatListMotion';

interface ChatDateSeparatorProps {
  label: string;
  fadeIn?: boolean;
}

const DATE_SEPARATOR_FADE_EASE = [0.21, 0.47, 0.32, 0.98] as const;

export const ChatDateSeparator: React.FC<ChatDateSeparatorProps> = ({ label, fadeIn = false }) => {
  const reduceMotion = usePrefersReducedMotion();
  const content = (
    <span className="rounded-full bg-gray-200/70 px-2.5 py-1 text-[10px] font-medium leading-none text-gray-600 shadow-sm backdrop-blur-sm dark:bg-gray-700/70 dark:text-gray-300">
      {label}
    </span>
  );

  return (
    <div
      className="flex justify-center py-1.5 pointer-events-none select-none"
      role="separator"
      aria-label={label}
    >
      {fadeIn && !reduceMotion ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: CHAT_LIST_FADE_TRANSITION_S, ease: DATE_SEPARATOR_FADE_EASE }}
        >
          {content}
        </motion.div>
      ) : (
        content
      )}
    </div>
  );
};
