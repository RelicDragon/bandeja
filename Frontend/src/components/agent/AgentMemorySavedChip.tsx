import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Brain, Loader2 } from 'lucide-react';
import type { AgentMemorySaved } from '@/features/agent/agentRunReducer';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { openAgentPermissionsScreen } from '@/queries/agent/useAgentPermissions';
import { useDeleteAgentMemoryMutation } from '@/queries/agent/useAgentMemory';
import { agentMemoryErrorMessage } from './agentMemoryErrors';

/**
 * "Saved to memory · Undo" under a `save_memory` tool chip (Phase 11, `memory.saved`). The
 * label opens Assistant settings on the Memory tab. Undo deletes a newly created note; an
 * updated note only links to the tab (deleting it would lose the earlier text too).
 */
export function AgentMemorySavedChip({ memory }: { memory: AgentMemorySaved }) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const deleteMutation = useDeleteAgentMemoryMutation();
  const [undone, setUndone] = useState(false);

  const undo = () => {
    deleteMutation.mutate(memory.id, {
      onSuccess: () => setUndone(true),
      onError: (err) => toast.error(agentMemoryErrorMessage(err, t)),
    });
  };

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="inline-flex max-w-full items-center gap-1 self-start rounded-full bg-primary-50 py-0.5 pe-1 ps-2 text-xs text-primary-800 dark:bg-primary-900/30 dark:text-primary-200"
      data-testid="agent-memory-saved-chip"
    >
      <Brain size={13} className="flex-shrink-0" aria-hidden />
      <button
        type="button"
        onClick={() => openAgentPermissionsScreen('memory')}
        aria-label={t('agent.memory.openMemory')}
        className="min-w-0 truncate py-0.5 text-start underline-offset-2 hover:underline"
      >
        {undone
          ? t('agent.memory.undoneChip')
          : memory.created
            ? t('agent.memory.savedChip')
            : t('agent.memory.updatedChip')}
      </button>
      {memory.created && !undone ? (
        <>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={undo}
            disabled={deleteMutation.isPending}
            className="inline-flex min-h-[28px] items-center gap-1 rounded-full px-2 font-semibold text-primary-700 transition-colors hover:bg-primary-100 disabled:opacity-50 dark:text-primary-300 dark:hover:bg-primary-900/50"
          >
            {deleteMutation.isPending ? <Loader2 size={12} className="animate-spin" aria-hidden /> : null}
            {t('agent.memory.undo')}
          </button>
        </>
      ) : null}
    </motion.div>
  );
}
