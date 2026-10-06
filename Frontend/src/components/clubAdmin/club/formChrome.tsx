/**
 * Club area form chrome: the sticky save bar (above the bottom tabs, and above the software
 * keyboard — Capacitor runs with `resize: none`, so it rides `--keyboard-height`), the
 * unsaved-changes guard (console back, in-app links, Android back, page unload) and a small
 * confirm sheet. Portalled to `body` because the console content animates with a transform,
 * which would turn `position: fixed` into "fixed to the page".
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { registerUnsavedGuard } from './guardedNavigate';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { useConsoleBack } from '@/clubAdmin/useConsoleBack';
import { buttonClass, cx } from '../console/classes';
import { ConsoleSheet } from '../console/ConsoleSheet';

// ---------------------------------------------------------------------------
// Save bar
// ---------------------------------------------------------------------------

export function SaveBar({
  visible,
  saving,
  disabled,
  onSave,
  onDiscard,
  message,
}: {
  visible: boolean;
  saving: boolean;
  disabled?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  message?: ReactNode;
}) {
  const { t } = useTranslation('clubAdmin');
  const reduceMotion = useReducedMotion();
  const keyboard = useKeyboardInset();
  const lifted = keyboard.visible && keyboard.insetPx > 0;
  return createPortal(
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={reduceMotion ? false : { y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduceMotion ? undefined : { y: 24, opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.32, 0.72, 0, 1] }}
          className={cx(
            'fixed inset-x-0 z-40 px-3 pb-2 lg:start-64 lg:bottom-0 lg:pb-4',
            lifted ? '' : 'bottom-[calc(3.5rem+env(safe-area-inset-bottom))]'
          )}
          style={lifted ? { bottom: keyboard.insetPx } : undefined}
          role="region"
          aria-label={t('club.form.unsaved')}
        >
          <div className="mx-auto flex max-w-2xl items-center gap-2 rounded-2xl border border-border bg-ca-surface/95 p-2 ps-4 shadow-lg backdrop-blur">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" aria-live="polite">
              {message ?? t('club.form.unsaved')}
            </span>
            <button type="button" className={buttonClass('ghost')} onClick={onDiscard} disabled={saving}>
              {t('club.form.discard')}
            </button>
            <button type="button" className={buttonClass('primary')} onClick={onSave} disabled={saving || disabled}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Confirm sheet
// ---------------------------------------------------------------------------

export function ConfirmSheet({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  destructive = true,
  busy,
  modalId,
  nested,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
  busy?: boolean;
  modalId: string;
  /** Opened on top of another console sheet. */
  nested?: boolean;
}) {
  const { t } = useTranslation('clubAdmin');
  return (
    <ConsoleSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      modalId={modalId}
      nested={nested}
      dismissible={!busy}
      footer={
        <div className="flex gap-2">
          <button type="button" className={buttonClass('secondary', 'flex-1')} onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button type="button" className={buttonClass(destructive ? 'danger' : 'primary', 'flex-1')} onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {confirmLabel}
          </button>
        </div>
      }
    >
      {body ? <div className="text-sm text-muted-foreground">{body}</div> : null}
    </ConsoleSheet>
  );
}

// ---------------------------------------------------------------------------
// Unsaved-changes guard
// ---------------------------------------------------------------------------

type Pending = { kind: 'back'; fallback: string } | { kind: 'href'; href: string; replace?: boolean } | { kind: 'hardwareBack' };

/**
 * While `dirty`: the console back button (`data-console-back`), in-app links, Android back and a
 * page unload ask before leaving; so does `useGuardedNavigate`. `fallback` = where back goes without in-app history.
 */
export function UnsavedChangesGuard({ dirty, fallback }: { dirty: boolean; fallback: string }) {
  const { t } = useTranslation('clubAdmin');
  const navigate = useNavigate();
  const back = useConsoleBack();
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as Element | null;
      if (target?.closest('[data-console-back]')) {
        e.preventDefault();
        e.stopPropagation();
        setPending({ kind: 'back', fallback });
        return;
      }
      const a = target?.closest('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.origin !== window.location.origin) return;
      const href = `${a.pathname}${a.search}${a.hash}`;
      if (href === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
      e.preventDefault();
      e.stopPropagation();
      setPending({ kind: 'href', href });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, fallback]);

  useEffect(() => {
    if (!dirty) return;
    return registerUnsavedGuard((href, replace) => setPending({ kind: 'href', href, replace }));
  }, [dirty]);

  // Android back while dirty: ask instead of leaving (registered like a modal so it runs first).
  useBackButtonModal(dirty && !pending, () => setPending({ kind: 'hardwareBack' }), 'club-form-unsaved-guard');

  const leave = useCallback(() => {
    const p = pending;
    setPending(null);
    if (!p) return;
    if (p.kind === 'href') navigate(p.href, { replace: p.replace });
    else back(p.kind === 'back' ? p.fallback : fallback);
  }, [pending, navigate, back, fallback]);

  return (
    <ConfirmSheet
      open={!!pending}
      onOpenChange={(o) => {
        if (!o) setPending(null);
      }}
      modalId="club-form-unsaved-prompt"
      title={t('club.form.leaveTitle')}
      body={t('club.form.leaveBody')}
      confirmLabel={t('club.form.discardAndLeave')}
      onConfirm={leave}
    />
  );
}
