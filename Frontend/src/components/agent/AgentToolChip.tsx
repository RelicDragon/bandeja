import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Check, ChevronDown, Loader2 } from 'lucide-react';
import type { AgentToolItemData } from '@/features/agent/agentTimeline';
import { AgentEntityList } from './AgentEntityCard';
import { AgentMemorySavedChip } from './AgentMemorySavedChip';

/** One tool step: "Looking up your games…" while running, the summary when finished. */
export const AgentToolChip = memo(function AgentToolChip({ tool }: { tool: AgentToolItemData }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const running = tool.status === 'running';
  const failed = tool.status === 'error';
  const title = running
    ? tool.label || t('agent.tool.working')
    : tool.summary || tool.label || (failed ? t('agent.tool.failed') : t('agent.tool.done'));
  const canExpand = !running && Boolean(tool.label) && tool.label !== title;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => canExpand && setOpen((v) => !v)}
        aria-expanded={canExpand ? open : undefined}
        className={`inline-flex max-w-full items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-xs transition-colors ${
          failed
            ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
            : 'border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
        } ${canExpand ? 'cursor-pointer' : 'cursor-default'}`}
      >
        {running ? (
          <Loader2 size={13} className="flex-shrink-0 animate-spin" aria-hidden />
        ) : failed ? (
          <AlertCircle size={13} className="flex-shrink-0" aria-hidden />
        ) : (
          <Check size={13} className="flex-shrink-0 text-green-600 dark:text-green-400" aria-hidden />
        )}
        <span className="truncate" dir="auto">
          {title}
        </span>
        {canExpand ? (
          <ChevronDown
            size={13}
            className={`flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        ) : null}
      </button>
      <AnimatePresence initial={false}>
        {open && canExpand ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <p className="ps-3 text-xs text-gray-500 dark:text-gray-400" dir="auto">
              {tool.label}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AgentEntityList entities={tool.entities} />
      {tool.memorySaved && !failed ? <AgentMemorySavedChip memory={tool.memorySaved} /> : null}
    </div>
  );
});
