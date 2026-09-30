import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, Lock, Smartphone, XCircle } from 'lucide-react';
import type { AgentPendingActionDto } from '@shared/agentContract';
import {
  agentClientActionButtons,
  agentClientRunLabelKey,
  agentClientSavingLabelKey,
} from '@/features/agent/agentActionButtons';
import type { AgentClientPriceQuote, AgentClientProgress } from '@/features/agent/agentClientExecutor';
import {
  answerAgentClientPrice,
  useAgentClientLocalState,
  type AgentClientLocalState,
} from '@/features/agent/agentClientExecStore';
import { AgentEntityList } from './AgentEntityCard';
import { ActionStatusRow, AgentActionPreviewSection } from './AgentActionCard';

export const AGENT_CONNECTED_CLUBS_PATH = '/profile/connected-clubs';

interface AgentClientActionCardProps {
  action: AgentPendingActionDto;
  rejecting: boolean;
  onReject: (actionId: string) => void;
  /** Claim → adapter → report (`useAgentClientExecution`). */
  onRun: (actionId: string) => void;
}

function formatPrice(quote: AgentClientPriceQuote): string {
  try {
    return new Intl.NumberFormat(undefined, quote.currency
      ? { style: 'currency', currency: quote.currency }
      : { maximumFractionDigits: 2 }).format(quote.total);
  } catch {
    return String(quote.total);
  }
}

function progressKey(
  progress: AgentClientProgress,
  toolName: string,
): { key: string; opts?: Record<string, number> } {
  switch (progress.kind) {
    case 'claiming':
      return { key: 'agent.clientExec.claiming' };
    case 'rechecking':
      return { key: 'agent.clientExec.rechecking' };
    case 'writing':
      return {
        key: progress.operation === 'book' ? 'agent.clientExec.booking' : 'agent.clientExec.cancelling',
        opts: { current: progress.index + 1, total: progress.total },
      };
    case 'saving':
      return { key: agentClientSavingLabelKey(toolName) };
  }
}

function Row({ tone, icon, children }: { tone: 'muted' | 'ok' | 'warn' | 'bad'; icon: ReactNode; children: ReactNode }) {
  const color = {
    muted: 'text-gray-600 dark:text-gray-300',
    ok: 'text-green-700 dark:text-green-400',
    warn: 'text-amber-700 dark:text-amber-300',
    bad: 'text-red-600 dark:text-red-400',
  }[tone];
  return (
    <div className={`flex items-start gap-1.5 text-sm ${color}`} dir="auto">
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function ConnectedClubsLink({ labelKey }: { labelKey: string }) {
  const { t } = useTranslation();
  return (
    <Link
      to={AGENT_CONNECTED_CLUBS_PATH}
      className="inline-flex h-10 items-center justify-center rounded-xl border border-primary-300 px-3 text-sm font-semibold text-primary-700 dark:border-primary-700 dark:text-primary-300"
    >
      {t(labelKey)}
    </Link>
  );
}

/** Settled server state, plus what only this device knows (not connected, handled elsewhere). */
function ClientOutcome({ action, local }: { action: AgentPendingActionDto; local: AgentClientLocalState | null }) {
  const { t } = useTranslation();
  const notConnected = local?.stage === 'finished' && local.notConnected;
  const entities = action.result?.entities ?? [];

  if (local?.stage === 'handled') {
    return <Row tone="muted" icon={<Smartphone size={16} aria-hidden />}>{t('agent.clientExec.handledElsewhere')}</Row>;
  }
  if (action.status === 'UNKNOWN' || local?.stage === 'interrupted') {
    return (
      <div className="flex flex-col gap-2">
        <Row tone="warn" icon={<HelpCircle size={16} aria-hidden />}>
          {/* A failed rollback's server message names the courts that may still be booked. */}
          {(action.status === 'UNKNOWN' && action.result?.message) || t('agent.clientExec.unknown')}
        </Row>
        <ConnectedClubsLink labelKey="agent.clientExec.openClubBookings" />
      </div>
    );
  }
  if (action.status === 'EXECUTED' && action.result?.partial) {
    return (
      <div className="flex flex-col gap-2">
        <Row tone="warn" icon={<AlertTriangle size={16} aria-hidden />}>
          {action.result.message || t('agent.clientExec.partial')}
        </Row>
        <AgentEntityList entities={entities} />
      </div>
    );
  }
  if (action.status === 'EXECUTED' && action.result?.ok !== false) {
    return (
      <div className="flex flex-col gap-2">
        <Row tone="ok" icon={<CheckCircle2 size={16} aria-hidden />}>{action.result?.message || t('agent.action.done')}</Row>
        <AgentEntityList entities={entities} />
      </div>
    );
  }
  if (action.status === 'FAILED' || action.status === 'EXECUTED') {
    return (
      <div className="flex flex-col gap-2">
        <Row tone="bad" icon={<XCircle size={16} aria-hidden />}>{action.result?.message || t('agent.clientExec.failed')}</Row>
        {notConnected ? <ConnectedClubsLink labelKey="agent.clientExec.connectClub" /> : null}
        <AgentEntityList entities={entities} />
      </div>
    );
  }
  if (action.status === 'CONFIRMED') {
    if (local?.stage === 'report_pending') {
      return <Row tone="warn" icon={<AlertTriangle size={16} aria-hidden />}>{t('agent.clientExec.reportPending')}</Row>;
    }
    if (local?.stage === 'error') {
      return <Row tone="bad" icon={<XCircle size={16} aria-hidden />}>{local.message}</Row>;
    }
    return (
      <Row tone="muted" icon={<Loader2 size={16} className="animate-spin" aria-hidden />}>
        {t('agent.clientExec.inProgress')}
      </Row>
    );
  }
  return <ActionStatusRow action={action} failed={false} success={false} />;
}

/**
 * Card for a client-executed action (`execution: 'client'`, booking plan §14.5 (ii)). Reject +
 * "Book in app" / "Cancel in app" (composite tools name both halves) — never "Always allow" (always critical). The write runs on
 * this device through the club's booking adapter; progress and the price step come from
 * `agentClientExecStore`, the outcome from the reported action.
 */
export const AgentClientActionCard = memo(function AgentClientActionCard({
  action,
  rejecting,
  onReject,
  onRun,
}: AgentClientActionCardProps) {
  const { t } = useTranslation();
  const local = useAgentClientLocalState(action.id);
  const buttons = agentClientActionButtons(action, local?.stage ?? null);
  const running = local?.stage === 'progress' || local?.stage === 'price';
  const border =
    action.status === 'PENDING' || running
      ? 'border-primary-300 dark:border-primary-700'
      : action.status === 'EXECUTED' && !action.result?.partial && action.result?.ok !== false
        ? 'border-green-200 dark:border-green-900/60'
        : action.status === 'FAILED' || action.status === 'UNKNOWN'
          ? 'border-red-200 dark:border-red-900/60'
          : 'border-gray-200 dark:border-gray-700';
  const runLabel = buttons.retry
    ? t('agent.clientExec.retry')
    : t(agentClientRunLabelKey(action.toolName));

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-gray-800 ${border}`}
      data-testid="agent-client-action-card"
    >
      <AgentActionPreviewSection action={action} />
      <div className="flex flex-col gap-2 p-3">
        {local?.stage === 'progress' ? (
          <Row tone="muted" icon={<Loader2 size={16} className="animate-spin" aria-hidden />}>
            {(() => {
              const { key, opts } = progressKey(local.progress, action.toolName);
              return t(key, opts);
            })()}
          </Row>
        ) : null}

        {local?.stage === 'price' ? (
          <div className="flex flex-col gap-2">
            <Row tone="warn" icon={<AlertTriangle size={16} aria-hidden />}>
              {t('agent.clientExec.priceQuote', { price: formatPrice(local.quote) })}
            </Row>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => answerAgentClientPrice(action.id, false)}
                className="flex h-11 flex-1 items-center justify-center rounded-xl border border-gray-200 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200"
              >
                {t('agent.clientExec.priceStop')}
              </button>
              <button
                type="button"
                onClick={() => answerAgentClientPrice(action.id, true)}
                className="flex h-11 flex-1 items-center justify-center rounded-xl bg-primary-600 text-sm font-semibold text-white"
              >
                {t('agent.clientExec.priceContinue', { price: formatPrice(local.quote) })}
              </button>
            </div>
          </div>
        ) : null}

        {!running && action.status !== 'PENDING' ? <ClientOutcome action={action} local={local} /> : null}
        {local?.stage === 'error' && action.status === 'PENDING' ? (
          <Row tone="bad" icon={<XCircle size={16} aria-hidden />}>{local.message}</Row>
        ) : null}
        {local?.stage === 'handled' && action.status === 'PENDING' ? (
          <Row tone="muted" icon={<Smartphone size={16} aria-hidden />}>{t('agent.clientExec.handledElsewhere')}</Row>
        ) : null}

        {buttons.run ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              {buttons.reject ? (
                <button
                  type="button"
                  disabled={rejecting}
                  onClick={() => onReject(action.id)}
                  className="flex h-11 flex-1 items-center justify-center rounded-xl border border-gray-200 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  {rejecting ? <Loader2 size={16} className="animate-spin" aria-hidden /> : t('agent.action.reject')}
                </button>
              ) : null}
              <button
                type="button"
                disabled={rejecting}
                onClick={() => onRun(action.id)}
                className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary-600 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
              >
                <Smartphone size={15} aria-hidden />
                {runLabel}
              </button>
            </div>
            {action.status === 'PENDING' ? (
              <p className="flex items-center justify-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                <Lock size={11} aria-hidden />
                {t('agent.clientExec.hint')}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
});
