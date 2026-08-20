import { useTranslation } from 'react-i18next';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { useGameSlotOverlapConfirmStore } from '@/store/gameSlotOverlapConfirmStore';

export function GameSlotOverlapConfirmHost() {
  const { t } = useTranslation();
  const open = useGameSlotOverlapConfirmStore((s) => s.open);
  const settle = useGameSlotOverlapConfirmStore((s) => s.settle);

  return (
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
}
