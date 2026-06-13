import { useTranslation } from 'react-i18next';
import { ConfirmationModal } from '@/components/ConfirmationModal';

type LinkedBookingAbsentModalProps = {
  isOpen: boolean;
  otherLinkedGameCount: number;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function LinkedBookingAbsentModal({
  isOpen,
  otherLinkedGameCount,
  isLoading,
  onClose,
  onConfirm,
}: LinkedBookingAbsentModalProps) {
  const { t } = useTranslation();
  const baseMessage = t('gameDetails.linkedBookings.absentMessage');
  const otherGamesNote =
    otherLinkedGameCount > 0
      ? ` ${t('gameDetails.linkedBookings.absentMessageOtherGames', { count: otherLinkedGameCount })}`
      : '';

  return (
    <ConfirmationModal
      isOpen={isOpen}
      onClose={() => !isLoading && onClose()}
      title={t('gameDetails.linkedBookings.absentTitle')}
      message={`${baseMessage}${otherGamesNote}`}
      confirmText={t('gameDetails.linkedBookings.absentConfirm')}
      cancelText={t('common.cancel')}
      confirmVariant="danger"
      isLoading={isLoading}
      onConfirm={onConfirm}
    />
  );
}
