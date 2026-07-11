import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, Clock } from 'lucide-react';
import { Button } from '@/components';
import { ConfirmationModal } from '@/components/ConfirmationModal';

interface GameCardJoinButtonProps {
  gameId: string;
  hasFreeSlots: boolean;
  onJoin: (gameId: string, e: React.MouseEvent) => void;
}

/** Join / queue CTA with a confirmation step. */
export function GameCardJoinButton({ gameId, hasFreeSlots, onJoin }: GameCardJoinButtonProps) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleConfirm = () => {
    const noopEvent = { stopPropagation: () => {}, preventDefault: () => {} } as React.MouseEvent;
    onJoin(gameId, noopEvent);
    setConfirmOpen(false);
  };

  return (
    <>
      <div className="mt-1">
        <Button
          onClick={(e) => {
            e.stopPropagation();
            setConfirmOpen(true);
          }}
          className={`w-full transition-all duration-300 shadow-md shadow-primary-500/25 hover:shadow-lg hover:shadow-primary-500/35 ${
            hasFreeSlots
              ? 'bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700'
              : 'bg-gradient-to-r from-sky-500 to-primary-600 hover:from-sky-600 hover:to-primary-700'
          }`}
          size="sm"
        >
          {hasFreeSlots ? <UserPlus size={15} /> : <Clock size={15} />}
          {hasFreeSlots ? t('createGame.addMeToGame') : t('games.joinTheQueue')}
        </Button>
      </div>
      {confirmOpen && (
        <ConfirmationModal
          isOpen={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={handleConfirm}
          title={hasFreeSlots ? t('games.confirmJoinTitle') : t('games.confirmJoinQueueTitle')}
          message={hasFreeSlots ? t('games.confirmJoinMessage') : t('games.confirmJoinQueueMessage')}
        />
      )}
    </>
  );
}
