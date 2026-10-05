/**
 * The club's copy of a linked reservation changed under us (upstream check):
 *  MOVED   — "Court 2 now starts 19:00 at Booktime" · Move game / Keep game time
 *  MISSING — "Court 2's reservation is gone at Booktime" · Reserve again / Unlink
 * One banner per drifted link, most urgent (missing) first. Organizers only.
 */
import { CalendarX2, Clock } from 'lucide-react';
import { providerDisplayName } from '@shared/gameBooking/reservationCopy';
import { pressScaleGuard } from '@/components/motion/pressScale';
import type { DriftActionKind, ReservationDrift } from './reservationDrift';
import type { CourtRef } from './courtReservationsModel';
import { useCourtReservationText } from './useCourtReservationText';
import './courtReservations.css';

export type ReservationDriftBannerProps = {
  drifts: readonly ReservationDrift[];
  courtsById: Readonly<Record<string, CourtRef>>;
  timeZone: string;
  /** `linkId:kind` of the action in flight. */
  pending?: string | null;
  onAction: (drift: ReservationDrift, kind: DriftActionKind) => void;
  className?: string;
};

export function ReservationDriftBanner({ drifts, courtsById, timeZone, pending = null, onAction, className }: ReservationDriftBannerProps) {
  const { t, clock } = useCourtReservationText(timeZone);
  if (drifts.length === 0) return null;
  const btn = `min-h-[44px] flex-1 rounded-xl px-3 text-sm font-semibold transition-[background-color,transform] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-60 enabled:active:scale-[0.98] ${pressScaleGuard}`;

  return (
    <ul className={`flex flex-col gap-2 ${className ?? ''}`} data-testid="reservation-drift-banner">
        {drifts.map((drift) => {
          const court = (drift.courtId && courtsById[drift.courtId]?.name) || t('card.anyCourt');
          const provider = providerDisplayName(drift.provider);
          const moved = drift.state === 'MOVED';
          const message = moved
            ? drift.upstreamStart
              ? t('drift.moved', { court, time: clock.time(drift.upstreamStart), provider })
              : t('drift.movedNoTime', { court, provider })
            : t('drift.missing', { court, provider });
          const actions: { kind: DriftActionKind; label: string; primary: boolean }[] = moved
            ? [
                { kind: 'keep_game', label: t('drift.keepGame'), primary: false },
                { kind: 'move_game', label: t('drift.moveGame'), primary: true },
              ]
            : [
                { kind: 'unlink', label: t('drift.unlink'), primary: false },
                { kind: 'reserve_again', label: t('drift.reserveAgain'), primary: true },
              ];
          // Entrance is CSS (≤ 180 ms, no height change → no layout shift); a resolved drift leaves at once.
          return (
            <li
              key={drift.linkId}
              role="status"
              data-drift-state={drift.state}
              className="cr-enter overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/40"
            >
              <p className="flex items-start gap-2 text-sm font-medium text-amber-950 dark:text-amber-50">
                {moved ? (
                  <Clock size={16} aria-hidden className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
                ) : (
                  <CalendarX2 size={16} aria-hidden className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
                )}
                {message}
              </p>
              <div className="mt-2 flex gap-2">
                {actions.map((a) => (
                  <button
                    key={a.kind}
                    type="button"
                    disabled={pending != null}
                    aria-busy={pending === `${drift.linkId}:${a.kind}` || undefined}
                    onClick={() => onAction(drift, a.kind)}
                    className={`${btn} ${
                      a.primary
                        ? 'bg-amber-600 text-white hover:bg-amber-700'
                        : 'text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/40'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
    </ul>
  );
}
