import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

interface AgentJumpToBottomProps {
  visible: boolean;
  /** Something new arrived below while the user was scrolled up: a dot on the button. */
  unread: boolean;
  onJump: () => void;
}

/**
 * Round "jump to latest" button, centered just above the composer. It lives inside the footer
 * (`data-cap-chat-composer`), so it rides above the software keyboard and the safe area with it.
 */
export function AgentJumpToBottom({ visible, unread, onJump }: AgentJumpToBottomProps) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const label = unread ? t('agent.thread.jumpToBottomNew') : t('agent.thread.jumpToBottom');
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-full flex justify-center pb-1">
      <AnimatePresence initial={false}>
        {visible ? (
          <motion.button
            key="jump"
            type="button"
            onClick={onJump}
            aria-label={label}
            title={label}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.85 }}
            transition={{ duration: reducedMotion ? 0.1 : 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto relative flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-lg shadow-black/10 transition-colors hover:bg-gray-50 active:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:shadow-black/40 dark:hover:bg-gray-700 dark:active:bg-gray-700"
          >
            <ArrowDown size={18} aria-hidden />
            {unread ? (
              <span
                aria-hidden
                className="absolute end-0.5 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-primary-500 dark:border-gray-800"
              />
            ) : null}
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
