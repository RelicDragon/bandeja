/**
 * Under the time grid: a court the club shows as busy over the picked time.
 * The club never says whose booking it is, and usually it is someone else's:
 * the card says to pick another time or court. "I booked it myself" (secondary,
 * outlined) marks the court as reserved; "Game only" stops checking the club
 * altogether. Claimed courts turn into a quiet confirmation
 * with Undo. Rows only animate in (CSS): nothing waits on an exit animation,
 * which a backgrounded WebView may never run.
 */
import { useTranslation } from 'react-i18next';
import { CalendarCheck2, CircleHelp } from 'lucide-react';
import { pressScaleGuard } from '@/components/motion/pressScale';
import type { ClubBookingConflict } from './clubBookingClaims';
import '@/features/court-reservations/courtReservations.css';

type ClubBookingClaimCardProps = {
  /** Busy at the club, not claimed yet. */
  open: readonly ClubBookingConflict[];
  /** Claimed in this edit (Undo offered). */
  claimed: readonly ClubBookingConflict[];
  courtName: (courtId: string) => string;
  formatTime: (iso: string) => string;
  onClaim: (courtId: string) => void;
  onUndo: (courtId: string) => void;
  /** The clean opt-out: stop checking the club for this game. */
  onGameOnly: () => void;
};

export function ClubBookingClaimCard({ open, claimed, courtName, formatTime, onClaim, onUndo, onGameOnly }: ClubBookingClaimCardProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2" data-testid="club-booking-claims">
        {open.map((conflict) => {
          const params = { court: courtName(conflict.courtId), from: formatTime(conflict.start), to: formatTime(conflict.end) };
          return (
            <section
              key={`open-${conflict.courtId}`}
              className="cr-enter rounded-2xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/60 dark:bg-amber-900/20"
              data-testid="club-booking-claim"
            >
              <div className="flex items-start gap-3">
                <CircleHelp size={18} aria-hidden className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{t('gameDetails.courts.clubBusyTitle', params)}</p>
                  <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">{t('gameDetails.courts.clubBusyElse')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onClaim(conflict.courtId)}
                className={`mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 text-sm font-semibold text-gray-900 transition-[background-color,transform] hover:bg-amber-100/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 active:scale-[0.98] dark:border-amber-700 dark:bg-gray-900 dark:text-white dark:hover:bg-amber-900/30 ${pressScaleGuard}`}
              >
                <CalendarCheck2 size={16} aria-hidden />
                {t('gameDetails.courts.clubBusyMine')}
              </button>
              <button
                type="button"
                onClick={onGameOnly}
                className="mt-1 flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 text-sm font-semibold text-gray-700 hover:bg-amber-100/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-200 dark:hover:bg-amber-900/30"
              >
                {t('gameDetails.courts.clubBusyGameOnly')}
              </button>
            </section>
          );
        })}
        {claimed.map((conflict) => {
          const params = { court: courtName(conflict.courtId), from: formatTime(conflict.start), to: formatTime(conflict.end) };
          return (
            <section
              key={`claimed-${conflict.courtId}`}
              className="cr-enter flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-800/60 dark:bg-emerald-900/20"
              data-testid="club-booking-claimed"
            >
              <CalendarCheck2 size={18} aria-hidden className="shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{t('gameDetails.courts.clubBusyClaimed', params)}</p>
                <p className="text-xs text-gray-600 dark:text-gray-300">{t('gameDetails.courts.clubBusyClaimedHint', params)}</p>
              </div>
              <button
                type="button"
                onClick={() => onUndo(conflict.courtId)}
                className="min-h-[44px] shrink-0 rounded-xl px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
              >
                {t('gameDetails.courts.clubBusyUndo')}
              </button>
            </section>
          );
        })}
    </div>
  );
}
