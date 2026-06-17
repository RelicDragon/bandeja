import React from 'react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import {
  CHAT_PANE_SLIDE_OFFSET,
  CHAT_PANE_SLIDE_TRANSITION,
} from '@/components/chat/chatListMotion';

type ChatPaneSlideOverlayProps = {
  visible: boolean;
  animating: boolean;
  onExitComplete: () => void;
  className?: string;
  children: React.ReactNode;
};

export function ChatPaneSlideOverlay({
  visible,
  animating,
  onExitComplete,
  className = 'absolute inset-0 h-full bg-gray-50 dark:bg-gray-900',
  children,
}: ChatPaneSlideOverlayProps) {
  const reduceMotion = usePrefersReducedMotion();
  const isOpen = visible && !animating;

  return (
    <motion.div
      className={className}
      initial={false}
      animate={{
        opacity: isOpen ? 1 : 0,
        x: isOpen ? 0 : CHAT_PANE_SLIDE_OFFSET,
      }}
      transition={reduceMotion ? { duration: 0 } : CHAT_PANE_SLIDE_TRANSITION}
      style={{
        zIndex: isOpen ? 10 : 0,
        pointerEvents: isOpen ? 'auto' : 'none',
      }}
      onAnimationComplete={() => {
        if (animating && !visible) onExitComplete();
      }}
    >
      {children}
    </motion.div>
  );
}
