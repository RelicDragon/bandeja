import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { EntityType } from '@/types';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { GameSetupForm, type GameSetupFormRef, type GameSetupFormInitialValues } from '@/components/GameSetup/GameSetupForm';
import type { GameSetupParams } from '@/types';

interface GameSetupModalProps {
  isOpen: boolean;
  entityType: EntityType;
  isEditing?: boolean;
  confirmButtonText?: string;
  initialValues?: GameSetupFormInitialValues;
  onClose: () => void;
  onConfirm: (params: GameSetupParams) => void;
}

export const GameSetupModal = ({
  isOpen,
  entityType,
  isEditing = true,
  confirmButtonText,
  initialValues,
  onClose,
  onConfirm,
}: GameSetupModalProps) => {
  const { t } = useTranslation();
  const formRef = useRef<GameSetupFormRef>(null);

  const handleConfirm = () => {
    formRef.current?.submit();
  };

  const handleFormConfirm = (params: GameSetupParams) => {
    onConfirm(params);
    onClose();
  };

  const getStartText = () => {
    if (confirmButtonText) return confirmButtonText;
    const entityTypeLower = entityType.toLowerCase();
    if (entityTypeLower === 'tournament') return t('gameResults.startTournament');
    if (entityTypeLower === 'bar') return t('gameResults.startBar');
    if (entityTypeLower === 'training') return t('gameResults.startTraining');
    return t('gameResults.startGame');
  };

  return (
    <Dialog open={isOpen} onClose={onClose} modalId="game-setup-modal">
      <DialogContent className="flex flex-col gap-2 p-2">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{t('gameResults.setupGame')}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <GameSetupForm
            ref={formRef}
            initialValues={initialValues}
            isEditing={isEditing}
            onConfirm={handleFormConfirm}
          />
        </div>
        <DialogFooter className="flex-shrink-0 flex gap-2 -mb-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg font-semibold transition-all duration-200 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105 p-2"
          >
            {t('common.cancel')}
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-lg shadow-green-500/50 hover:scale-105 p-2"
            >
              {getStartText()}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
