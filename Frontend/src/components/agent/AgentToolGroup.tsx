import { memo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, type Transition } from 'framer-motion';
import { AlertCircle, Check, ChevronDown, Loader2 } from 'lucide-react';
import type { AgentToolItemData } from '@/features/agent/agentTimeline';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { AgentEntityList } from './AgentEntityCard';
import { AgentMemorySavedChip } from './AgentMemorySavedChip';
import { AgentWebImageStrip, AgentWebResults } from './AgentWebResults';

type StepState = AgentToolItemData['status'];

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
const COLLAPSE: Transition = { height: { duration: 0.28, ease: EASE_OUT }, opacity: { duration: 0.2 } };

function useToolTitle(tool: AgentToolItemData): string {
  const { t } = useTranslation();
  if (tool.status === 'running') return tool.label || t('agent.tool.working');
  return tool.summary || tool.label || (tool.status === 'error' ? t('agent.tool.failed') : t('agent.tool.done'));
}

/** Spinner → check / alert, cross-faded so a finishing step doesn't blink. */
function StepIcon({ state, size = 13 }: { state: StepState; size?: number }) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <span className="relative inline-flex flex-shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={state}
          className="absolute inset-0 inline-flex items-center justify-center"
          initial={reducedMotion ? false : { opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
        >
          {state === 'running' ? (
            <Loader2 size={size} className="animate-spin text-primary-500 dark:text-primary-400" aria-hidden />
          ) : state === 'error' ? (
            <AlertCircle size={size} className="text-red-500 dark:text-red-400" aria-hidden />
          ) : (
            <Check size={size} strokeWidth={2.5} className="text-emerald-500 dark:text-emerald-400" aria-hidden />
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Text that slides/fades when it changes ("Looking up games…" → "Found 3 games"). */
function RollingText({ text, className = '' }: { text: string; className?: string }) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <span className={`relative grid min-w-0 overflow-hidden ${className}`}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={text}
          className="col-start-1 row-start-1 truncate"
          dir="auto"
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.24, ease: EASE_OUT }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          initial={reducedMotion ? false : { height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={COLLAPSE}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Details a finished step can reveal: its request label (when the title is the summary) and web results. */
function StepDetails({ tool, title }: { tool: AgentToolItemData; title: string }) {
  const hasLabelDetail = Boolean(tool.label) && tool.label !== title;
  return (
    <div className="flex flex-col gap-1.5 pt-1">
      {hasLabelDetail ? (
        <p className="text-xs text-gray-400 dark:text-gray-500" dir="auto">
          {tool.label}
        </p>
      ) : null}
      {tool.web ? <AgentWebResults web={tool.web} /> : null}
      {tool.images?.length ? <AgentWebImageStrip images={tool.images} /> : null}
    </div>
  );
}

function stepHasDetails(tool: AgentToolItemData, title: string): boolean {
  return (
    tool.status !== 'running' &&
    ((Boolean(tool.label) && tool.label !== title) || Boolean(tool.web) || Boolean(tool.images?.length))
  );
}

/** One row inside an expanded group; web results open on their own. */
function ToolStepRow({ tool }: { tool: AgentToolItemData }) {
  const { t } = useTranslation();
  const title = useToolTitle(tool);
  const [open, setOpen] = useState(false);
  const canExpand = stepHasDetails(tool, title);
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: EASE_OUT }}
      className="flex flex-col"
    >
      <button
        type="button"
        onClick={() => canExpand && setOpen((v) => !v)}
        aria-expanded={canExpand ? open : undefined}
        aria-label={canExpand && (tool.web || tool.images?.length) ? `${title}. ${t('agent.web.details')}` : undefined}
        className={`flex min-w-0 items-center gap-2 py-0.5 text-start text-xs ${
          tool.status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
        } ${canExpand ? 'cursor-pointer hover:text-gray-700 dark:hover:text-gray-200' : 'cursor-default'}`}
      >
        <StepIcon state={tool.status} size={12} />
        <RollingText text={title} className="flex-1" />
        {canExpand ? (
          <ChevronDown
            size={12}
            className={`flex-shrink-0 opacity-60 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        ) : null}
      </button>
      <Collapse open={open && canExpand}>
        <div className="ps-5">
          <StepDetails tool={tool} title={title} />
        </div>
      </Collapse>
    </motion.li>
  );
}

/**
 * Consecutive tool steps as one compact line: the running step's label while working, the
 * summary (one step) or a step count (several) when done. Tap to expand the steps. Result
 * cards and "saved to memory" stay visible below — they are what the user came for.
 */
export const AgentToolGroup = memo(function AgentToolGroup({ tools }: { tools: AgentToolItemData[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const single = tools.length === 1 ? tools[0] : null;
  const runningTool = tools.find((x) => x.status === 'running') ?? null;
  const failed = tools.filter((x) => x.status === 'error').length;
  const singleTitle = useToolTitle(tools[0]);
  const runningTitle = useToolTitle(runningTool ?? tools[0]);

  const state: StepState = runningTool ? 'running' : failed === tools.length ? 'error' : 'ok';
  const title = runningTool
    ? runningTitle
    : single
      ? singleTitle
      : failed > 0
        ? t('agent.tool.stepsFailed', { n: tools.length, failed })
        : t('agent.tool.steps', { n: tools.length });
  const canExpand = single ? stepHasDetails(single, singleTitle) : true;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col self-start" style={{ maxWidth: '100%' }}>
        <button
          type="button"
          onClick={() => canExpand && setOpen((v) => !v)}
          aria-expanded={canExpand ? open : undefined}
          className={`-mx-1.5 inline-flex min-w-0 max-w-[calc(100%+0.75rem)] items-center gap-2 rounded-lg px-1.5 py-1 text-[13px] transition-colors duration-200 ${
            state === 'error' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
          } ${canExpand ? 'cursor-pointer hover:bg-gray-200/50 active:bg-gray-200/80 dark:hover:bg-gray-800/70 dark:active:bg-gray-800' : 'cursor-default'}`}
        >
          <StepIcon state={state} />
          <RollingText text={title} />
          <AnimatePresence initial={false}>
            {runningTool && tools.length > 1 ? (
              <motion.span
                key="count"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex-shrink-0 rounded-full bg-gray-200/70 px-1.5 text-[11px] tabular-nums text-gray-500 dark:bg-gray-700/70 dark:text-gray-300"
              >
                {tools.length}
              </motion.span>
            ) : null}
          </AnimatePresence>
          {canExpand ? (
            <ChevronDown
              size={13}
              className={`flex-shrink-0 opacity-60 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
              aria-hidden
            />
          ) : null}
        </button>
        <Collapse open={open && canExpand}>
          {single ? (
            <div className="ps-6">
              <StepDetails tool={single} title={singleTitle} />
            </div>
          ) : (
            <ol className="ms-[6px] mt-0.5 flex flex-col gap-0.5 border-s border-gray-200 ps-3 dark:border-gray-700">
              {tools.map((tool) => (
                <ToolStepRow key={tool.callId} tool={tool} />
              ))}
            </ol>
          )}
        </Collapse>
      </div>
      {tools.map((tool) =>
        tool.entities.length > 0 || (tool.memorySaved && tool.status !== 'error') ? (
          <motion.div
            key={tool.callId}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: EASE_OUT }}
            className="flex flex-col gap-2"
          >
            <AgentEntityList entities={tool.entities} />
            {tool.memorySaved && tool.status !== 'error' ? <AgentMemorySavedChip memory={tool.memorySaved} /> : null}
          </motion.div>
        ) : null,
      )}
    </div>
  );
});
