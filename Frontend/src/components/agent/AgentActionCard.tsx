import { memo, useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, type Transition } from 'framer-motion';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Loader2, Lock, ShieldQuestion, XCircle, Zap } from 'lucide-react';
import type { AgentActionPreviewLine, AgentPendingActionDto } from '@shared/agentContract';
import { agentActionButtons } from '@/features/agent/agentActionButtons';
import { agentActionOutcomeHaptic, agentActionPhase, agentPreviewLineKind, type AgentActionPhase } from '@/features/agent/agentActionPhase';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { openAgentPermissionsScreen } from '@/queries/agent/useAgentPermissions';
import { hapticError, hapticSelection, hapticSuccess } from '@/utils/haptics';
import { AgentEntityList } from './AgentEntityCard';
import { AgentToolCard } from './AgentToolCard';

interface AgentActionCardProps {
  action: AgentPendingActionDto | null;
  busy: 'confirm' | 'always' | 'reject' | null;
  onConfirm: (actionId: string) => void;
  onReject: (actionId: string) => void;
  /** Confirm with `remember: 'always'`; the button shows only when `action.canAlwaysAllow`. */
  onAlwaysAllow?: (actionId: string) => void;
}

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
const COLLAPSE: Transition = { height: { duration: 0.26, ease: EASE_OUT }, opacity: { duration: 0.18 } };

/** Height + fade in / out (instant with reduced motion). Skipped for a card that mounts settled. */
function Collapsible({ children, reducedMotion }: { children: ReactNode; reducedMotion: boolean }) {
  return (
    <motion.div
      initial={reducedMotion ? false : { height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={reducedMotion ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
      transition={COLLAPSE}
      className="overflow-hidden"
    >
      {children}
    </motion.div>
  );
}

/** Outcome haptic once per phase change seen on screen (never for a card that arrives settled). */
function useOutcomeHaptic(phase: AgentActionPhase | null) {
  const previous = useRef<AgentActionPhase | null>(phase);
  useEffect(() => {
    if (phase == null) return;
    const haptic = agentActionOutcomeHaptic(previous.current, phase);
    if (haptic === 'success') hapticSuccess();
    else if (haptic === 'error') hapticError();
    previous.current = phase;
  }, [phase]);
}

/**
 * Confirmation card. Everything shown comes from the server-rendered `preview`
 * (never from model text); the buttons exist only while the action is PENDING:
 * Reject / Allow once / Always allow (plan §15). An auto-approved action arrives settled.
 * Confirm taps give a light haptic and the outcome a success / error one; the buttons
 * collapse into the compact result line (instant with reduced motion).
 */
export const AgentActionCard = memo(function AgentActionCard({
  action,
  busy,
  onConfirm,
  onReject,
  onAlwaysAllow,
}: AgentActionCardProps) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const phase = action ? agentActionPhase(action, busy) : null;
  useOutcomeHaptic(phase);

  if (!action || !phase) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-3 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
        <Loader2 size={14} className="me-1.5 inline animate-spin" aria-hidden />
        {t('agent.action.loading')}
      </div>
    );
  }

  const buttons = agentActionButtons(action);
  const pending = buttons.allowOnce;
  const executing = phase === 'executing';
  const showAlwaysAllow = buttons.alwaysAllow && onAlwaysAllow != null;
  const success = phase === 'done';
  const failed = phase === 'failed';
  const border = pending
    ? 'border-primary-300 dark:border-primary-700'
    : failed
      ? 'border-red-200 dark:border-red-900/60'
      : success
        ? 'border-green-200 dark:border-green-900/60'
        : 'border-gray-200 dark:border-gray-700';
  const confirm = (always: boolean) => {
    hapticSelection();
    if (always) onAlwaysAllow?.(action.id);
    else onConfirm(action.id);
  };

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors duration-300 dark:bg-gray-800 ${border}`}
      aria-busy={executing || undefined}
    >
      <AgentActionPreviewSection action={action} />

      <AnimatePresence initial={false} mode="wait">
        {pending ? (
          <Collapsible key="buttons" reducedMotion={reducedMotion}>
            <div className="flex flex-col gap-2 p-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => onReject(action.id)}
                  className="flex h-11 flex-1 items-center justify-center rounded-xl border border-gray-200 text-sm font-medium text-gray-700 transition-[colors,opacity] hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  {busy === 'reject' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : t('agent.action.reject')}
                </button>
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => confirm(false)}
                  className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary-600 text-sm font-semibold text-white transition-[colors,opacity,transform] duration-200 hover:bg-primary-700 active:scale-[0.98] motion-reduce:active:scale-100 ${
                    busy === 'confirm' ? 'disabled:opacity-90' : 'disabled:opacity-50'
                  }`}
                >
                  {busy === 'confirm' ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden />
                      <span>{t('agent.action.applying')}</span>
                    </>
                  ) : (
                    t('agent.action.allowOnce')
                  )}
                </button>
              </div>
              {showAlwaysAllow ? (
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => confirm(true)}
                  className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary-300 text-sm font-semibold text-primary-700 transition-[colors,opacity] hover:bg-primary-50 dark:border-primary-700 dark:text-primary-300 dark:hover:bg-primary-900/30 ${
                    busy === 'always' ? 'disabled:opacity-90' : 'disabled:opacity-50'
                  }`}
                >
                  {busy === 'always' ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden />
                      <span>{t('agent.action.applying')}</span>
                    </>
                  ) : (
                    t('agent.action.alwaysAllow')
                  )}
                </button>
              ) : null}
              {buttons.alwaysAsksHint ? (
                <p className="flex items-center justify-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                  <Lock size={11} aria-hidden />
                  {t('agent.action.alwaysAsks')}
                </p>
              ) : null}
            </div>
          </Collapsible>
        ) : (
          <Collapsible key="result" reducedMotion={reducedMotion}>
            <div className="flex flex-col gap-2 p-3" role="status">
              <ActionStatusRow action={action} failed={failed} success={success} />
              {action.autoApproved ? <AutoApprovedNote /> : null}
            </div>
          </Collapsible>
        )}
      </AnimatePresence>
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

/** Result icon that pops in when the outcome arrives on screen (static when the card mounts settled). */
function PopIcon({ children }: { children: ReactNode }) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <motion.span
      className="mt-0.5 inline-flex flex-shrink-0"
      initial={reducedMotion ? false : { scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 26, delay: 0.12 }}
    >
      {children}
    </motion.span>
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
          <PopIcon>
            <XCircle size={16} aria-hidden />
          </PopIcon>
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
          <PopIcon>
            <CheckCircle2 size={16} aria-hidden />
          </PopIcon>
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

/** One preview row: a change is `old` (struck) → `new` (highlighted); otherwise the value alone. */
function PreviewLineValue({ line }: { line: AgentActionPreviewLine }) {
  const kind = agentPreviewLineKind(line);
  if (kind === 'change') {
    return (
      <>
        <span className="text-gray-500 line-through decoration-gray-400/70 dark:text-gray-400" dir="auto">
          {line.from}
        </span>
        <ArrowRight size={14} className="flex-shrink-0 text-gray-400 rtl:rotate-180" aria-hidden />
        <span
          className="rounded-md bg-primary-50 px-1.5 py-0.5 font-medium text-primary-800 dark:bg-primary-900/40 dark:text-primary-200"
          dir="auto"
        >
          {line.to}
        </span>
      </>
    );
  }
  if (kind === 'removed') {
    return (
      <span className="text-gray-500 line-through decoration-gray-400/70 dark:text-gray-400" dir="auto">
        {line.from}
      </span>
    );
  }
  return (
    <span className="font-medium text-gray-900 dark:text-white" dir="auto">
      {line.to}
    </span>
  );
}

/**
 * Title, the optional rich card (e.g. the scoreboard of a score entry), `label: from → to`
 * lines (hidden when `linesInCard` and the card is shown) and warnings of the preview.
 */
export function AgentActionPreviewSection({ action }: { action: AgentPendingActionDto }) {
  const { t } = useTranslation();
  const { preview } = action;
  const card = preview.card;
  const showLines = preview.lines.length > 0 && !(card && preview.linesInCard);
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

      {card ? (
        <div className="mx-3 mt-2">
          <AgentToolCard card={card} linkable={false} />
        </div>
      ) : null}

      {showLines ? (
        <dl className="mx-3 mt-2 divide-y divide-gray-100 rounded-xl bg-gray-50 dark:divide-gray-700/70 dark:bg-gray-900/40">
          {preview.lines.map((line, i) => (
            <div key={`${line.label}-${i}`} className="px-3 py-2">
              <dt className="text-[11px] text-gray-500 dark:text-gray-400" dir="auto">
                {line.label}
              </dt>
              <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm">
                <PreviewLineValue line={line} />
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
