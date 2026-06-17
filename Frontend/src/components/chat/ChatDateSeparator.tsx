import React from 'react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { CHAT_LIST_FADE_TRANSITION_S, EASE } from '@/components/chat/chatListMotion';

interface ChatDateSeparatorProps {
  label: string;
  fadeIn?: boolean;
}

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
          transition={{ duration: CHAT_LIST_FADE_TRANSITION_S, ease: EASE }}
        >
          {content}
        </motion.div>
      ) : (
        content
      )}
    </div>
  );
};
