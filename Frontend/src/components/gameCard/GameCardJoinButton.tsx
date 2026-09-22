import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, Clock } from 'lucide-react';
import { Button } from '@/components';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { useAuthStore } from '@/store/authStore';
import { genderI18nContext } from '@/utils/i18nGender';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { SPOT_OPENED_SHIMMER_MS } from '@/features/spot-opened/spotOpenedWindow';
import { resolveGameCardJoinLabel } from '@/components/gameCard/gameCardJoinLabel';

interface GameCardJoinButtonProps {
  gameId: string;
  hasFreeSlots: boolean;
  onJoin: (gameId: string, e: React.MouseEvent) => void;
  /** PRD 347 — a seat opened in the last 2 h; sweep the button once. */
  spotJustOpened?: boolean;
  /** PRD 359 — seats open to this viewer; `null`/omitted keeps the plain label. */
  openSeats?: number | null;
  /** PRD 359 — players already waiting, shown only when the game is full. */
  queueLength?: number;
}

/** Join / queue CTA with a confirmation step. */
export function GameCardJoinButton({
  gameId,
  hasFreeSlots,
  onJoin,
  spotJustOpened = false,
  openSeats = null,
  queueLength = 0,
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

  /*
   * PRD 359 — the count rides inside the existing label rather than next to it.
   * The long form is dropped below `sm`, where the card is narrowest, so the
   * label never wraps to a second line; the short form still carries the
   * number, and `aria-label` always carries the whole sentence, so nothing is
   * lost to a screen reader at any width.
   */
  const label = resolveGameCardJoinLabel({ hasFreeSlots, openSeats, queueLength });
  const baseLabel = hasFreeSlots ? t('createGame.addMeToGame') : t('games.joinTheQueue');

  let suffixLong: string | null = null;
  let suffixShort: string | null = null;
  let ariaLabel: string | undefined;
  if (label.kind === 'joinSeatsLeft') {
    suffixLong = t('games.joinSeatsLeft', { count: label.seats });
    suffixShort = t('games.joinSeatsLeftShort', { count: label.seats });
    ariaLabel = t('games.joinAriaSeatsLeft', { count: label.seats });
  } else if (label.kind === 'queueWaiting') {
    suffixLong = t('games.joinQueueWaiting', { count: label.waiting });
    suffixShort = suffixLong;
    ariaLabel = t('games.joinAriaQueueWaiting', { count: label.waiting });
  }

  return (
    <>
      <div className="relative mt-1 overflow-hidden rounded-lg">
        <Button
          onClick={(e) => {
            e.stopPropagation();
            setConfirmOpen(true);
          }}
          aria-label={ariaLabel}
          className={`w-full transition-all duration-300 shadow-md shadow-primary-500/25 hover:shadow-lg hover:shadow-primary-500/35 ${
            hasFreeSlots
              ? 'bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700'
              : 'bg-gradient-to-r from-sky-500 to-primary-600 hover:from-sky-600 hover:to-primary-700'
          }`}
          size="sm"
        >
          {hasFreeSlots ? <UserPlus size={15} /> : <Clock size={15} />}
          {/*
            Not `truncate`: the count is the point of the suffix, and an
            ellipsis would eat it first. Below `sm` the short form keeps the
            whole label on one line on a 375 pt phone in every locale; at a
            large accessibility text size it wraps to a second line instead of
            clipping (engagement plan §2 rule 3).
          */}
          <span className="min-w-0 text-center">
            {baseLabel}
            {suffixLong ? (
              <>
                <span aria-hidden>{' · '}</span>
                <span className="hidden sm:inline">{suffixLong}</span>
                <span className="sm:hidden">{suffixShort}</span>
              </>
            ) : null}
          </span>
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
