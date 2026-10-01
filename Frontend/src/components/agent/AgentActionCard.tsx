import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Loader2, Lock, ShieldQuestion, XCircle, Zap } from 'lucide-react';
import type { AgentPendingActionDto } from '@shared/agentContract';
import { agentActionButtons } from '@/features/agent/agentActionButtons';
import { openAgentPermissionsScreen } from '@/queries/agent/useAgentPermissions';
import { AgentEntityList } from './AgentEntityCard';

interface AgentActionCardProps {
  action: AgentPendingActionDto | null;
  busy: 'confirm' | 'always' | 'reject' | null;
  onConfirm: (actionId: string) => void;
  onReject: (actionId: string) => void;
  /** Confirm with `remember: 'always'`; the button shows only when `action.canAlwaysAllow`. */
  onAlwaysAllow?: (actionId: string) => void;
}

/**
 * Confirmation card. Everything shown comes from the server-rendered `preview`
 * (never from model text); the buttons exist only while the action is PENDING:
 * Reject / Allow once / Always allow (plan §15). An auto-approved action arrives settled.
 */
export const AgentActionCard = memo(function AgentActionCard({
  action,
  busy,
  onConfirm,
  onReject,
  onAlwaysAllow,
}: AgentActionCardProps) {
  const { t } = useTranslation();
  if (!action) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-3 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
        <Loader2 size={14} className="me-1.5 inline animate-spin" aria-hidden />
        {t('agent.action.loading')}
      </div>
    );
  }

  const { status } = action;
  const buttons = agentActionButtons(action);
  const pending = buttons.allowOnce;
  const showAlwaysAllow = buttons.alwaysAllow && onAlwaysAllow != null;
  const success = status === 'EXECUTED' || status === 'CONFIRMED';
  // UNKNOWN: a client-executed action's lease expired with no report; the result says what to check.
  const failed = status === 'FAILED' || status === 'UNKNOWN' || (success && action.result?.ok === false);
  const border = pending
    ? 'border-primary-300 dark:border-primary-700'
    : failed
      ? 'border-red-200 dark:border-red-900/60'
      : success
        ? 'border-green-200 dark:border-green-900/60'
        : 'border-gray-200 dark:border-gray-700';

  return (
    <div className={`overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-gray-800 ${border}`}>
      <AgentActionPreviewSection action={action} />

      <div className="p-3">
        {pending ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy != null}
                onClick={() => onReject(action.id)}
                className="flex h-11 flex-1 items-center justify-center rounded-xl border border-gray-200 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {busy === 'reject' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : t('agent.action.reject')}
              </button>
              <button
                type="button"
                disabled={busy != null}
                onClick={() => onConfirm(action.id)}
                className="flex h-11 flex-1 items-center justify-center rounded-xl bg-primary-600 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
              >
                {busy === 'confirm' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : t('agent.action.allowOnce')}
              </button>
            </div>
            {showAlwaysAllow ? (
              <button
                type="button"
                disabled={busy != null}
                onClick={() => onAlwaysAllow?.(action.id)}
                className="flex h-11 w-full items-center justify-center rounded-xl border border-primary-300 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-50 disabled:opacity-50 dark:border-primary-700 dark:text-primary-300 dark:hover:bg-primary-900/30"
              >
                {busy === 'always' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : t('agent.action.alwaysAllow')}
              </button>
            ) : null}
            {buttons.alwaysAsksHint ? (
              <p className="flex items-center justify-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                <Lock size={11} aria-hidden />
                {t('agent.action.alwaysAsks')}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <ActionStatusRow action={action} failed={failed} success={success} />
            {action.autoApproved ? <AutoApprovedNote /> : null}
          </div>
        )}
      </div>
    </div>
  );
});

function AutoApprovedNote() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
      <Zap size={13} className="flex-shrink-0 text-primary-600 dark:text-primary-400" aria-hidden />
      <span>{t('agent.action.autoApproved')}</span>
      <button
        type="button"
        onClick={() => openAgentPermissionsScreen()}
        className="font-medium text-primary-600 underline-offset-2 hover:underline dark:text-primary-400"
      >
        {t('agent.permissions.manage')}
      </button>
    </div>
  );
}

export function ActionStatusRow({
  action,
  failed,
  success,
}: {
  action: AgentPendingActionDto;
  failed: boolean;
  success: boolean;
}) {
  const { t } = useTranslation();
  const message = action.result?.message;
  if (failed) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400" dir="auto">
          <XCircle size={16} className="mt-0.5 flex-shrink-0" aria-hidden />
          <span>{message || t('agent.action.failed')}</span>
        </div>
        <AgentEntityList entities={action.result?.entities ?? []} />
      </div>
    );
  }
  if (success) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-1.5 text-sm text-green-700 dark:text-green-400" dir="auto">
          <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" aria-hidden />
          <span>{message || (action.status === 'CONFIRMED' ? t('agent.action.confirmed') : t('agent.action.done'))}</span>
        </div>
        <AgentEntityList entities={action.result?.entities ?? []} />
      </div>
    );
  }
  const expired = action.status === 'EXPIRED';
  return (
    <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
      {expired ? <Clock size={16} aria-hidden /> : <XCircle size={16} aria-hidden />}
      <span>{expired ? t('agent.action.expired') : t('agent.action.rejected')}</span>
    </div>
  );
}

/** Title, `label: from → to` lines and warnings of the server-rendered preview. */
export function AgentActionPreviewSection({ action }: { action: AgentPendingActionDto }) {
  const { t } = useTranslation();
  const { preview } = action;
  return (
    <>
      <div className="flex items-start gap-2 px-3 pt-3">
        <ShieldQuestion size={18} className="mt-0.5 flex-shrink-0 text-primary-600 dark:text-primary-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {action.autoApproved ? t('agent.action.autoHeading') : t('agent.action.heading')}
          </p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white" dir="auto">
            {preview.title}
          </p>
        </div>
      </div>

      {preview.lines.length > 0 ? (
        <dl className="mx-3 mt-2 divide-y divide-gray-100 rounded-xl bg-gray-50 dark:divide-gray-700/70 dark:bg-gray-900/40">
          {preview.lines.map((line, i) => (
            <div key={`${line.label}-${i}`} className="px-3 py-2">
              <dt className="text-[11px] text-gray-500 dark:text-gray-400" dir="auto">
                {line.label}
              </dt>
              <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm" dir="auto">
                {line.from != null ? (
                  <span className="text-gray-500 line-through decoration-gray-400/70 dark:text-gray-400">{line.from}</span>
                ) : null}
                {line.from != null && line.to != null ? (
                  <ArrowRight size={14} className="flex-shrink-0 text-gray-400 rtl:rotate-180" aria-hidden />
                ) : null}
                {line.to != null ? (
                  <span className="font-medium text-gray-900 dark:text-white">{line.to}</span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {preview.warnings.length > 0 ? (
        <ul className="mx-3 mt-2 space-y-1">
          {preview.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300" dir="auto">
              <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" aria-hidden />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
