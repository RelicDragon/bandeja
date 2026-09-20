import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, Clock } from 'lucide-react';
import { Button } from '@/components';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { useAuthStore } from '@/store/authStore';
import { genderI18nContext } from '@/utils/i18nGender';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { SPOT_OPENED_SHIMMER_MS } from '@/features/spot-opened/spotOpenedWindow';

interface GameCardJoinButtonProps {
  gameId: string;
  hasFreeSlots: boolean;
  onJoin: (gameId: string, e: React.MouseEvent) => void;
  /** PRD 347 — a seat opened in the last 2 h; sweep the button once. */
  spotJustOpened?: boolean;
}

/** Join / queue CTA with a confirmation step. */
export function GameCardJoinButton({
  gameId,
  hasFreeSlots,
  onJoin,
  spotJustOpened = false,
}: GameCardJoinButtonProps) {
  const { t } = useTranslation();
  const genderCtx = genderI18nContext(useAuthStore((s) => s.user?.gender));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const reduceMotion = usePrefersReducedMotion();
  const [shimmering, setShimmering] = useState(false);

  useEffect(() => {
    if (!spotJustOpened || reduceMotion) {
      setShimmering(false);
      return;
    }
    setShimmering(true);
    const timer = window.setTimeout(() => setShimmering(false), SPOT_OPENED_SHIMMER_MS);
    return () => window.clearTimeout(timer);
  }, [spotJustOpened, reduceMotion]);

  const handleConfirm = () => {
    const noopEvent = { stopPropagation: () => {}, preventDefault: () => {} } as React.MouseEvent;
    onJoin(gameId, noopEvent);
    setConfirmOpen(false);
  };

  return (
    <>
      <div className="relative mt-1 overflow-hidden rounded-lg">
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
        {shimmering ? (
          <span
            aria-hidden
            data-testid="join-button-shimmer"
            className="pointer-events-none absolute inset-0 animate-spot-shimmer bg-gradient-to-r from-transparent via-white/45 to-transparent"
          />
        ) : null}
      </div>
      {confirmOpen && (
        <ConfirmationModal
          isOpen={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={handleConfirm}
          title={hasFreeSlots ? t('games.confirmJoinTitle') : t('games.confirmJoinQueueTitle')}
          message={
            hasFreeSlots
              ? t('games.confirmJoinMessage', { context: genderCtx })
              : t('games.confirmJoinQueueMessage', { context: genderCtx })
          }
        />
      )}
    </>
  );
}
