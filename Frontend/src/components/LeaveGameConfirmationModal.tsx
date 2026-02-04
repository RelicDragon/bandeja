import { useTranslation } from 'react-i18next';
import { Button } from '@/components';
import { AlertTriangle } from 'lucide-react';
import { EntityType } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';

interface LeaveGameConfirmationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onClose: () => void;
  isLeaving?: boolean;
  entityType: EntityType;
}

export const LeaveGameConfirmationModal = ({
  isOpen,
  onConfirm,
  onClose,
  isLeaving = false,
  entityType
}: LeaveGameConfirmationModalProps) => {
  const { t } = useTranslation();

  const getConfirmationText = () => {
    const keyMap: Record<EntityType, string> = {
      'GAME': 'gameDetails.leaveGameConfirmationGame',
      'TOURNAMENT': 'gameDetails.leaveGameConfirmationTournament',
      'LEAGUE': 'gameDetails.leaveGameConfirmationLeague',
      'LEAGUE_SEASON': 'gameDetails.leaveGameConfirmationLeagueSeason',
      'BAR': 'gameDetails.leaveGameConfirmationBar',
      'TRAINING': 'gameDetails.leaveGameConfirmationTraining',
    };
    const key = keyMap[entityType] || 'gameDetails.leaveGameConfirmation';
    return t(key);
  };

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <Dialog open={isOpen} onClose={onClose} modalId="leave-game-confirmation-modal">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('gameDetails.leaveGame')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col text-center">
          <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle
              size={24}
              className="text-orange-600 dark:text-orange-400"
            />
          </div>
          <DialogDescription className="mb-6">
            {getConfirmationText()}
          </DialogDescription>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-3">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1"
            disabled={isLeaving}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            variant="danger"
            className="flex-1"
            disabled={isLeaving}
          >
            {isLeaving ? t('common.leaving') || 'Leaving...' : t('common.leave')}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
};

