import { useTranslation } from 'react-i18next';
import { AlertCircle, Gauge, Hourglass, RotateCcw } from 'lucide-react';
import { agentErrorKey } from '@/features/agent/agentErrors';
import {
  AGENT_LIMIT_COUNTDOWN_MS,
  formatAgentCountdown,
  useAgentResetTime,
  type AgentLimit,
} from '@/features/agent/agentLimits';

/**
 * Rate limit / daily budget reached: what happened, when it lifts (user's time format) and a
 * live countdown in the last hour. The composer is paused meanwhile (see `AgentChatView`).
 */
export function AgentLimitCard({ limit, msLeft }: { limit: AgentLimit; msLeft: number }) {
  const { t } = useTranslation();
  const time = useAgentResetTime(limit.retryAt);
  const budget = limit.code === 'BUDGET_EXCEEDED';
  const Icon = budget ? Gauge : Hourglass;
  const countdown = time && msLeft > 0 && msLeft <= AGENT_LIMIT_COUNTDOWN_MS ? formatAgentCountdown(msLeft) : null;
  const body = budget
    ? time
      ? t('agent.limits.budgetBody', { time })
      : t('agent.limits.budgetBodyNoTime')
    : time
      ? t('agent.limits.rateBody', { time })
      : t('agent.limits.rateBodyNoTime');

  return (
    <div
      role="status"
      data-agent-limit={limit.code}
      className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/40"
    >
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
        <Icon size={18} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
          {t(budget ? 'agent.limits.budgetTitle' : 'agent.limits.rateTitle')}
        </p>
        <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-200/90">{body}</p>
        {countdown ? (
          <p className="mt-1 text-xs font-medium tabular-nums text-amber-700 dark:text-amber-300">
            {t('agent.limits.countdown', { duration: countdown })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** A failed run: the reason, plus Retry (resends the last own message) when that is possible. */
export function AgentRunErrorBanner({
  code,
  onRetry,
  retryDisabled,
}: {
  code: string | null | undefined;
  onRetry?: () => void;
  retryDisabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
      <AlertCircle size={16} className="mt-0.5 flex-shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{t(agentErrorKey(code))}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={retryDisabled}
          className="-my-0.5 inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-900/40"
        >
          <RotateCcw size={12} aria-hidden />
          {t('common.retry')}
        </button>
      ) : null}
    </div>
  );
}
