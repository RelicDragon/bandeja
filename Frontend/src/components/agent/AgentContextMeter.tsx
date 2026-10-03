import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquarePlus } from 'lucide-react';
import type { AgentChatUsageDto } from '@shared/agentContract';
import { agentContextLevel, agentContextRatio, type AgentContextLevel } from '@/features/agent/agentContextUsage';
import { Drawer, DrawerCloseButton, DrawerContent, DrawerHandle } from '@/components/ui/Drawer';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';

const SHEET_ID = 'agent-context-sheet';
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

const LEVEL_STROKE: Record<AgentContextLevel, string> = {
  ok: 'text-gray-500 dark:text-gray-400',
  warn: 'text-amber-500',
  critical: 'text-red-500',
};

function Donut({
  ratio,
  level,
  size,
  stroke,
}: {
  ratio: number;
  level: AgentContextLevel;
  size: number;
  stroke: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        className="stroke-gray-200 dark:stroke-gray-700"
      />
      {ratio > 0 ? (
        // Fills from empty on mount, then glides to each new value.
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - ratio) }}
          transition={{ duration: 0.7, ease: EASE_OUT }}
          className={`${LEVEL_STROKE[level]} transition-colors duration-500`}
        />
      ) : null}
    </svg>
  );
}

function useTokenFormat() {
  const { i18n } = useTranslation();
  return useMemo(() => {
    const compact = new Intl.NumberFormat(i18n.language, {
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    return (n: number) => compact.format(n);
  }, [i18n.language]);
}

/**
 * Header donut: share of the context window the chat's latest model call used. Hidden until the
 * chat has used any context, then grows in (the header title gives way smoothly).
 */
export function AgentContextMeterButton({
  usage,
  onClick,
}: {
  usage: AgentChatUsageDto | undefined;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const ratio = usage ? agentContextRatio(usage) : 0;
  const level = agentContextLevel(ratio);
  const percent = Math.round(ratio * 100);
  return (
    <AnimatePresence initial={false}>
      {usage && usage.contextTokens > 0 ? (
        <motion.button
          key="context-meter"
          type="button"
          onClick={onClick}
          aria-label={t('agent.context.meterLabel', { percent })}
          initial={{ opacity: 0, scale: 0.4, width: 0 }}
          animate={{ opacity: 1, scale: 1, width: 36 }}
          exit={{ opacity: 0, scale: 0.4, width: 0 }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
          className="flex h-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <Donut ratio={ratio} level={level} size={20} stroke={3} />
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}

/** Above the composer from the warn threshold on. Not dismissible: it goes away with a new chat. */
export function AgentContextHint({
  usage,
  onNewChat,
  creating,
}: {
  usage: AgentChatUsageDto | undefined;
  onNewChat: () => void;
  creating: boolean;
}) {
  const { t } = useTranslation();
  const level = usage ? agentContextLevel(agentContextRatio(usage)) : 'ok';
  const critical = level === 'critical';
  return (
    <AnimatePresence initial={false}>
      {level !== 'ok' ? (
        <motion.div
          key="context-hint"
          initial={{ opacity: 0, y: 8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: 8, height: 0 }}
          transition={{ duration: 0.28, ease: EASE_OUT }}
          className="overflow-hidden px-3"
        >
          <div
            role="status"
            className={`mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border px-3 py-2 text-[13px] shadow-sm backdrop-blur ${
              critical
                ? 'border-red-200 bg-red-50/95 text-red-800 dark:border-red-900/60 dark:bg-red-950/80 dark:text-red-200'
                : 'border-amber-200 bg-amber-50/95 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/80 dark:text-amber-100'
            }`}
          >
            <span className="min-w-0 flex-1 leading-snug">
              {t(critical ? 'agent.context.hintCritical' : 'agent.context.hintWarn')}
            </span>
            <button
              type="button"
              onClick={onNewChat}
              disabled={creating}
              className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition-opacity disabled:opacity-60 ${
                critical ? 'bg-red-600' : 'bg-amber-600'
              }`}
            >
              <MessageSquarePlus size={14} aria-hidden />
              {t('agent.context.newChat')}
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function formatDuration(ms: number, locale: string): string {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const unit = (value: number, u: 'hour' | 'minute') =>
    new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: u,
      unitDisplay: 'narrow',
    }).format(value);
  if (hours === 0) return unit(minutes, 'minute');
  return minutes === 0 ? unit(hours, 'hour') : `${unit(hours, 'hour')} ${unit(minutes, 'minute')}`;
}

/** Tap on the donut: context use, daily budget left and when it resets. */
export function AgentContextSheet({
  open,
  usage,
  onClose,
  onNewChat,
  creating,
}: {
  open: boolean;
  usage: AgentChatUsageDto | undefined;
  onClose: () => void;
  onNewChat: () => void;
  creating: boolean;
}) {
  const { t, i18n } = useTranslation();
  const fmt = useTokenFormat();
  useBackButtonModal(open, onClose, SHEET_ID);
  if (!usage) return null;

  const ratio = agentContextRatio(usage);
  const level = agentContextLevel(ratio);
  const percent = Math.round(ratio * 100);
  const dailyLeft = Math.max(0, usage.dailyBudgetTokens - usage.dailyUsedTokens);
  const dailyRatio = usage.dailyBudgetTokens > 0 ? Math.min(1, usage.dailyUsedTokens / usage.dailyBudgetTokens) : 1;
  const dailyLevel = dailyRatio >= 0.9 ? 'critical' : dailyRatio >= 0.75 ? 'warn' : 'ok';
  const resetsAt = new Date(usage.dailyResetsAt);
  const resetTime = new Intl.DateTimeFormat(i18n.language, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(resetsAt);
  const resetIn = formatDuration(resetsAt.getTime() - Date.now(), i18n.language);
  const barColor = {
    ok: 'bg-primary-500',
    warn: 'bg-amber-500',
    critical: 'bg-red-500',
  }[dailyLevel];

  return (
    <Drawer open={open} handleOnly onOpenChange={(next) => !next && onClose()}>
      <DrawerContent
        className="flex flex-col overflow-hidden bg-white dark:bg-gray-900"
        aria-labelledby={`${SHEET_ID}-title`}
      >
        <DrawerHandle className="relative mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-gray-300/90 dark:bg-gray-600" />
        <div data-overlay-chrome="" className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-3">
          <h2
            id={`${SHEET_ID}-title`}
            className="min-w-0 flex-1 truncate text-start text-lg font-semibold text-gray-900 dark:text-white"
          >
            {t('agent.context.title')}
          </h2>
          <DrawerCloseButton aria-label={t('common.close')} className="shrink-0" />
        </div>
        <div className="flex flex-col gap-4 px-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <section className="flex items-center gap-4 rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/60">
            <div className="relative flex-shrink-0">
              <Donut ratio={ratio} level={level} size={64} stroke={7} />
              <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                {percent}%
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium text-gray-900 dark:text-white">
                {t('agent.context.contextUsed', { percent })}
              </p>
              <p className="mt-0.5 text-sm tabular-nums text-gray-500 dark:text-gray-400">
                {t('agent.context.tokensOf', {
                  used: fmt(usage.contextTokens),
                  total: fmt(usage.contextWindowTokens),
                })}
              </p>
            </div>
          </section>
          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
            {t(level === 'ok' ? 'agent.context.explainOk' : 'agent.context.explainLong')}
          </p>

          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('agent.context.dailyTitle')}</h3>
              <span className="text-sm tabular-nums text-gray-500 dark:text-gray-400">
                {t('agent.context.tokensOf', {
                  used: fmt(usage.dailyUsedTokens),
                  total: fmt(usage.dailyBudgetTokens),
                })}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className={`h-full rounded-full ${barColor} transition-[width] duration-500 ease-out`}
                style={{ width: `${Math.max(dailyRatio * 100, 1)}%` }}
              />
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-800/60">
                <dt className="text-xs text-gray-500 dark:text-gray-400">{t('agent.context.left')}</dt>
                <dd className="font-semibold tabular-nums text-gray-900 dark:text-white">{fmt(dailyLeft)}</dd>
              </div>
              <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-800/60">
                <dt className="text-xs text-gray-500 dark:text-gray-400">{t('agent.context.resets')}</dt>
                <dd className="font-semibold tabular-nums text-gray-900 dark:text-white">
                  {t('agent.context.resetsAt', {
                    time: resetTime,
                    duration: resetIn,
                  })}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('agent.context.dailyExplain')}</p>
          </section>

          <button
            type="button"
            onClick={onNewChat}
            disabled={creating}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-[15px] font-semibold text-white transition-opacity disabled:opacity-60"
          >
            <MessageSquarePlus size={18} aria-hidden />
            {t('agent.context.newChat')}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
