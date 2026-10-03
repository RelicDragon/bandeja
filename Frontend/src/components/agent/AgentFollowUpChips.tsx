import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CornerDownRight } from 'lucide-react';
import type { AgentMessageDto, AgentPendingActionDto } from '@shared/agentContract';
import { useAuthStore } from '@/store/authStore';
import { agentFollowUps, summarizeAgentTurn } from '@/features/agent/agentFollowUps';
import { hapticSelection } from '@/utils/haptics';

/**
 * Follow-up suggestions under the latest finished reply. Derived from the turn's tool calls
 * and writes (`agentFollowUps`), no model call. The caller hides them while a run is active,
 * a send is in flight or the composer has text; a pending write card hides them here.
 */
export function AgentFollowUpChips({
  messages,
  actions,
  hidden,
  onPick,
}: {
  messages: readonly AgentMessageDto[];
  actions: readonly AgentPendingActionDto[];
  hidden: boolean;
  onPick: (text: string) => void;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const isAdmin = useAuthStore((s) => Boolean(s.user?.isAdmin));
  const lastMessageId = messages[messages.length - 1]?.id ?? '';

  const keys = useMemo(
    () => agentFollowUps(summarizeAgentTurn(messages, actions), { isAdmin }),
    [messages, actions, isAdmin],
  );
  const show = !hidden && keys.length > 0;

  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key={`follow-ups-${lastMessageId}`}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={{ duration: 0.3, delay: reduceMotion ? 0 : 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="-mx-4"
        >
          <div
            role="group"
            aria-label={t('agent.followUps.label')}
            className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {keys.map((key) => {
              const text = t(`agent.followUps.${key}`);
              return (
                <button
                  key={key}
                  type="button"
                  dir="auto"
                  onClick={() => {
                    hapticSelection();
                    onPick(text);
                  }}
                  className="inline-flex min-h-[44px] flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-primary-200 bg-white px-4 text-sm font-medium text-primary-700 shadow-sm shadow-gray-900/[0.03] transition-colors hover:bg-primary-50 active:scale-[0.98] active:bg-primary-100 dark:border-primary-800/70 dark:bg-gray-800 dark:text-primary-300 dark:hover:bg-gray-700 dark:active:bg-gray-700"
                >
                  <CornerDownRight size={14} className="flex-shrink-0 opacity-70 rtl:-scale-x-100" aria-hidden />
                  {text}
                </button>
              );
            })}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
