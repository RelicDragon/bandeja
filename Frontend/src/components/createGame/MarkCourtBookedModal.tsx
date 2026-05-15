import { useTranslation } from 'react-i18next';
import { ConfirmationModal } from '@/components/ConfirmationModal';

interface MarkCourtBookedModalProps {
  isOpen: boolean;
  onMarkBooked: () => void;
  onSkip: () => void;
}

export function MarkCourtBookedModal({ isOpen, onMarkBooked, onSkip }: MarkCourtBookedModalProps) {
  const { t } = useTranslation();

  return (
    <ConfirmationModal
      isOpen={isOpen}
      tone="info"
      title={t('createGame.markCourtBookedTitle')}
      message={t('createGame.markCourtBookedMessage')}
      confirmText={t('createGame.markCourtBookedYes')}
      cancelText={t('createGame.markCourtBookedSkip')}
      onConfirm={onMarkBooked}
      onClose={onSkip}
    />
  );
}
