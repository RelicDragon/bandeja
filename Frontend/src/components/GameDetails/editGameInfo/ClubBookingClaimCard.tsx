/**
 * Under the time grid: a court the club shows as busy over the picked time.
 *
 * When the organizer's club account is connected we check it (`verdictOf`):
 *  - their own reservation → "Use my <provider> booking" (primary): it is
 *    linked to the game on save, a real reservation rather than a mark;
 *  - not in their account → it is someone else's booking: pick another time
 *    or court; "I booked it another way" stays as a small text link;
 *  - can't check (not connected / loading) → most likely someone else's;
 *    "I booked it another way" (outlined) marks the court booked by the organizer.
 * Free courts at that time are offered as chips: one tap swaps the court.
 * Chosen courts turn into a quiet confirmation with Undo — green for a linked
 * booking, sky for "booked by organizer".
 * Rows only animate in (CSS): nothing waits on an exit animation, which a
 * backgrounded WebView may never run.
 */
import { useTranslation } from 'react-i18next';
import { BadgeCheck, CalendarCheck2, CalendarX2, CircleHelp, UserCheck } from 'lucide-react';
import { pressScaleGuard } from '@/components/motion/pressScale';
import type { ClubBookingConflict, ClubBookingVerdict, OwnClubBooking } from './clubBookingClaims';
import '@/features/court-reservations/courtReservations.css';

type ClubBookingClaimCardProps = {
  /** Busy at the club, not claimed yet. */
  open: readonly ClubBookingConflict[];
  /** Marked reserved in this edit (Undo offered). */
  claimed: readonly ClubBookingConflict[];
  /** Own reservations chosen for linking in this edit (Undo offered). */
  linked?: readonly { conflict: ClubBookingConflict; booking: OwnClubBooking }[];
  courtName: (courtId: string) => string;
  formatTime: (iso: string) => string;
  /** Whose booking it is, from the organizer's club account. */
  verdictOf?: (conflict: ClubBookingConflict) => ClubBookingVerdict;
  /** Display name of the club's booking system ("Booktime"). */
  providerName?: string;
  onClaim: (courtId: string) => void;
  onUndo: (courtId: string) => void;
  onUseOwn?: (courtId: string, booking: OwnClubBooking) => void;
  onUndoOwn?: (courtId: string) => void;
  /** Courts free over the picked time (not already picked). */
  freeCourts?: readonly { id: string; name: string }[];
  /** Swap a busy court for a free one. */
  onSwap?: (fromCourtId: string, toCourtId: string) => void;
};

const primaryBtn = `mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 active:scale-[0.98] ${pressScaleGuard}`;
const outlineBtn = `mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 text-sm font-semibold text-gray-900 transition-[background-color,transform] hover:bg-amber-100/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 active:scale-[0.98] dark:border-amber-700 dark:bg-gray-900 dark:text-white dark:hover:bg-amber-900/30 ${pressScaleGuard}`;
const quietBtn =
  'mt-1 flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 text-sm font-semibold text-gray-700 hover:bg-amber-100/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-200 dark:hover:bg-amber-900/30';

export function ClubBookingClaimCard({
  open,
  claimed,
  linked = [],
  courtName,
  formatTime,
  verdictOf,
  providerName = '',
  onClaim,
  onUndo,
  onUseOwn,
  onUndoOwn,
  freeCourts = [],
  onSwap,
}: ClubBookingClaimCardProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2" data-testid="club-booking-claims">
      {open.map((conflict) => {
        const params = { court: courtName(conflict.courtId), from: formatTime(conflict.start), to: formatTime(conflict.end), provider: providerName };
        const verdict = verdictOf?.(conflict) ?? { kind: 'unknown' as const };
        const ownBooking = verdict.kind === 'own' && onUseOwn ? verdict.booking : null;
        return (
          <section
            key={`open-${conflict.courtId}`}
            className="cr-enter rounded-2xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/60 dark:bg-amber-900/20"
            data-testid="club-booking-claim"
            data-verdict={verdict.kind}
          >
            <div className="flex items-start gap-3">
              {verdict.kind === 'notInAccount' ? (
                <CalendarX2 size={18} aria-hidden className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
              ) : (
                <CircleHelp size={18} aria-hidden className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{t('gameDetails.courts.clubBusyTitle', params)}</p>
                <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
                  {ownBooking
                    ? t('gameDetails.courts.clubBusyOwnFound', params)
                    : verdict.kind === 'notInAccount'
                      ? t('gameDetails.courts.clubBusyNotInAccount', params)
                      : t('gameDetails.courts.clubBusyElse')}
                </p>
              </div>
            </div>
            {ownBooking ? (
              <button type="button" onClick={() => onUseOwn?.(conflict.courtId, ownBooking)} className={primaryBtn}>
                <BadgeCheck size={16} aria-hidden />
                {t('gameDetails.courts.clubBusyUseOwn', params)}
              </button>
            ) : verdict.kind === 'notInAccount' ? (
              <button type="button" onClick={() => onClaim(conflict.courtId)} className={quietBtn}>
                {t('gameDetails.courts.clubBusyMineOtherWay')}
              </button>
            ) : (
              <button type="button" onClick={() => onClaim(conflict.courtId)} className={outlineBtn}>
                <CalendarCheck2 size={16} aria-hidden />
                {t('gameDetails.courts.clubBusyMine')}
              </button>
            )}
            {!ownBooking && onSwap && freeCourts.length > 0 ? (
              <div className="mt-3" data-testid="club-busy-free-courts">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-200">{t('gameDetails.courts.clubBusyFreeCourts')}</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {freeCourts.slice(0, 6).map((court) => (
                    <button
                      key={court.id}
                      type="button"
                      onClick={() => onSwap(conflict.courtId, court.id)}
                      className="min-h-[44px] rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 hover:border-primary-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    >
                      {t('gameDetails.courts.clubBusyUseCourt', { court: court.name })}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        );
      })}
      {linked.map(({ conflict, booking }) => {
        const params = { court: courtName(conflict.courtId), from: formatTime(booking.start), to: formatTime(booking.end), provider: providerName };
        return (
          <section
            key={`linked-${conflict.courtId}`}
            className="cr-enter flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-800/60 dark:bg-emerald-900/20"
            data-testid="club-booking-linked"
          >
            <BadgeCheck size={18} aria-hidden className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{t('gameDetails.courts.clubBusyOwnLinked', params)}</p>
              <p className="text-xs text-gray-600 dark:text-gray-300">{t('gameDetails.courts.clubBusyOwnLinkedHint', params)}</p>
            </div>
            <button
              type="button"
              onClick={() => onUndoOwn?.(conflict.courtId)}
              className="min-h-[44px] shrink-0 rounded-xl px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
            >
              {t('gameDetails.courts.clubBusyUndo')}
            </button>
          </section>
        );
      })}
      {claimed.map((conflict) => {
        const params = { court: courtName(conflict.courtId), from: formatTime(conflict.start), to: formatTime(conflict.end) };
        return (
          <section
            key={`claimed-${conflict.courtId}`}
            className="cr-enter flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2.5 dark:border-sky-800/60 dark:bg-sky-900/20"
            data-testid="club-booking-claimed"
          >
            <UserCheck size={18} aria-hidden className="shrink-0 text-sky-600 dark:text-sky-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{t('gameDetails.courts.clubBusyClaimed', params)}</p>
              <p className="text-xs text-gray-600 dark:text-gray-300">{t('gameDetails.courts.clubBusyClaimedHint', params)}</p>
            </div>
            <button
              type="button"
              onClick={() => onUndo(conflict.courtId)}
              className="min-h-[44px] shrink-0 rounded-xl px-3 text-sm font-semibold text-sky-700 hover:bg-sky-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-300 dark:hover:bg-sky-900/40"
            >
              {t('gameDetails.courts.clubBusyUndo')}
            </button>
          </section>
        );
      })}
    </div>
  );
}
