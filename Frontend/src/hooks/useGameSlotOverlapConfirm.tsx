import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { isOverlapConfirmRequired } from '@/utils/gameSlotOverlapConfirm';

export function useGameSlotOverlapConfirm() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const pendingRef = useRef<((confirmed: boolean) => void) | null>(null);

  const ask = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      pendingRef.current = resolve;
      setOpen(true);
    });
  }, []);

  const settle = useCallback((confirmed: boolean) => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setOpen(false);
    pending?.(confirmed);
  }, []);

  const runWithOverlapConfirm = useCallback(
    async <T,>(action: (confirmOverlap: boolean) => Promise<T>): Promise<T | undefined> => {
      try {
        return await action(false);
      } catch (error) {
        if (!isOverlapConfirmRequired(error)) throw error;
        const confirmed = await ask();
        if (!confirmed) return undefined;
        return await action(true);
      }
    },
    [ask],
  );

  const overlapConfirmModal = (
    <ConfirmationModal
      isOpen={open}
      title={t('games.overlapConfirmTitle')}
      message={t('games.overlapConfirmMessage')}
      confirmText={t('games.overlapConfirmProceed')}
      cancelText={t('common.cancel')}
      closeOnConfirm={false}
      onConfirm={() => settle(true)}
      onClose={() => settle(false)}
    />
  );

  return { runWithOverlapConfirm, overlapConfirmModal };
}
