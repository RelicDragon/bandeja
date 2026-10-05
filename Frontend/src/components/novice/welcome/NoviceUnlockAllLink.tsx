import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { LayoutGrid } from 'lucide-react';
import { ConfirmationModal } from '@/components';
import { unlockAllNovice } from '@/hooks/useNovice';

interface NoviceUnlockAllLinkProps {
  className?: string;
  /**
   * Runs after the user confirms and before the shell unlocks (e.g. play the
   * Welcome page's exit animation). The unlock waits for it.
   */
  onBeforeUnlock?: () => Promise<void> | void;
  /** The unlock request failed (the shell stays locked) — undo `onBeforeUnlock`. */
  onUnlockFailed?: () => void;
}

/**
 * Low-emphasis "I know my way around — show me everything" → confirmation →
 * `unlockAll()` (optimistic; a failure rolls back and toasts).
 */
export function NoviceUnlockAllLink({ className, onBeforeUnlock, onUnlockFailed }: NoviceUnlockAllLinkProps) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setConfirmOpen(false);
    setBusy(true);
    try {
      await onBeforeUnlock?.();
      await unlockAllNovice();
    } catch {
      onUnlockFailed?.();
      toast.error(t('novice.shell.unlockAll.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={busy}
        data-testid="novice-unlock-all"
        className={
          className ??
          'inline-flex min-h-[2.75rem] items-center justify-center px-3 text-xs font-medium text-gray-500 underline-offset-4 hover:underline disabled:opacity-60 dark:text-gray-400'
        }
      >
        {t('novice.shell.unlockAll.link')}
      </button>
      <ConfirmationModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void handleConfirm()}
        title={t('novice.shell.unlockAll.title')}
        message={t('novice.shell.unlockAll.message')}
        confirmText={t('novice.shell.unlockAll.confirm')}
        cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
        confirmVariant="primary"
        tone="info"
        icon={LayoutGrid}
      />
    </>
  );
}
