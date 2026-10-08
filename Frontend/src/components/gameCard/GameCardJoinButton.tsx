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
  /**
   * `block` — full-width button carrying the seat count in its label.
   * `pill` — compact ticket-footer CTA; the card's seat caption sits right next
   * to it, so the label stays short and the count moves to `aria-label`.
   */
  variant?: 'block' | 'pill';
}

/** Join / queue CTA with a confirmation step. */
export function GameCardJoinButton({
  gameId,
  hasFreeSlots,
  onJoin,
  spotJustOpened = false,
  openSeats = null,
  queueLength = 0,
  variant = 'block',
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

  const confirmModal = confirmOpen ? (
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
  ) : null;

  if (variant === 'pill') {
    return (
      <>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmOpen(true);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={ariaLabel ?? baseLabel}
          className={`relative inline-flex h-9 shrink-0 items-center gap-1.5 overflow-hidden rounded-full pe-3.5 ps-2 text-[13px] font-semibold transition-colors ${
            hasFreeSlots
              ? 'bg-gray-900 text-white shadow-[0_6px_16px_-6px_rgb(2_132_199_/_0.7)] hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100'
              : 'bg-white text-gray-900 ring-1 ring-gray-900/10 hover:bg-gray-50 dark:bg-white/10 dark:text-white dark:ring-white/15 dark:hover:bg-white/15'
          }`}
        >
          {hasFreeSlots ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-white">
              <UserPlus size={12} strokeWidth={2.75} aria-hidden />
            </span>
          ) : (
            <Clock size={15} className="ms-0.5 text-sky-500" data-member-accent="sky" aria-hidden />
          )}
          <span className="whitespace-nowrap">{hasFreeSlots ? t('games.join') : t('games.card.joinQueueShort')}</span>
          {shimmering ? (
            <span
              aria-hidden
              data-testid="join-button-shimmer"
              className="pointer-events-none absolute inset-0 animate-spot-shimmer bg-gradient-to-r from-transparent via-white/45 to-transparent"
            />
          ) : null}
        </button>
        {confirmModal}
      </>
    );
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
          data-member-accent="sky"
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
      {confirmModal}
    </>
  );
}
