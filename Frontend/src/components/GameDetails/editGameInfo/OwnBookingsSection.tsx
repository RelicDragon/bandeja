/**
 * Edit → When and where, under the club: "Use a booking I already made".
 * The organizer's upcoming bookings at the club that this game doesn't use
 * yet (any day, `useOwnUpcomingClubBookings`). Tapping one moves the draft to
 * its date, time, length and court; Save links it (before the time moves).
 * The chosen one turns green with a check and Undo. Not connected to the club's booking
 * system → one quiet row that opens the connect form.
 * Rows only animate in (CSS): nothing waits on an exit animation.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, Check, ChevronDown, Link2, Undo2 } from 'lucide-react';
import type { Club } from '@/types';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { ClubBookingConnectInline } from '@/components/booktime/ClubBookingConnectInline';
import { LocationTimeStepHeader } from '@/components/gameLocationTime/LocationTimeStepHeader';
import { parseBooktimeIntegrationConfig } from '@shared/clubIntegration';
import type { OwnClubBooking } from './clubBookingClaims';
import type { OwnUpcomingClubBookings } from './useOwnClubBookings';
import '@/features/court-reservations/courtReservations.css';

const FIRST_ROWS = 4;

type OwnBookingsSectionProps = {
  club: Club;
  own: OwnUpcomingClubBookings;
  /** The booking chosen for this game in this edit (linked on save). */
  pickedId: string | null;
  courtName: (courtId: string) => string;
  formatRange: (start: string, end: string) => string;
  timeZone: string;
  locale: string;
  onPick: (booking: OwnClubBooking) => void;
  onUndo: () => void;
};

export function OwnBookingsSection({
  club,
  own,
  pickedId,
  courtName,
  formatRange,
  timeZone,
  locale,
  onPick,
  onUndo,
}: OwnBookingsSectionProps) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const day = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(locale, { timeZone, weekday: 'short', day: 'numeric', month: 'short' });
    } catch {
      return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' });
    }
  }, [locale, timeZone]);

  if (own.state === 'connect') {
    return (
      <section className="space-y-2" data-testid="schedule-own-bookings-connect">
        {connecting ? (
          <ClubBookingConnectInline
            club={club}
            integrationConfig={parseBooktimeIntegrationConfig(club.integrationConfig) ?? undefined}
            onConnected={() => setConnecting(false)}
            onSkip={() => setConnecting(false)}
            skipLabel={t('common.cancel')}
          />
        ) : (
          <button
            type="button"
            onClick={() => setConnecting(true)}
            className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-1 text-start text-sm font-medium text-primary-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-300 dark:hover:bg-gray-800"
          >
            <Link2 size={16} aria-hidden className="shrink-0" />
            {t('gameDetails.whenWhere.ownConnect', { club: club.name })}
          </button>
        )}
      </section>
    );
  }
  if (own.state !== 'ready' || own.bookings.length === 0) return null;

  // The chosen one always stays in view.
  const bookings = own.bookings;
  const pickedIndex = bookings.findIndex((b) => b.externalBookingId === pickedId);
  const visible =
    showAll || bookings.length <= FIRST_ROWS
      ? bookings
      : bookings.filter((_, i) => i < FIRST_ROWS || i === pickedIndex);
  const hidden = bookings.length - visible.length;

  return (
    <section className="cr-enter space-y-2" data-testid="schedule-own-bookings">
      <LocationTimeStepHeader icon={CalendarCheck} title={t('gameDetails.whenWhere.ownTitle', { club: club.name })} />
      <p className="text-xs leading-snug text-gray-600 dark:text-gray-400">{t('gameDetails.whenWhere.ownHint')}</p>
      <ul className="flex flex-col gap-2">
        {visible.map((b) => {
          const picked = b.externalBookingId === pickedId;
          return (
            <li key={b.externalBookingId}>
              {picked ? (
                <div
                  className="cr-enter flex min-h-[56px] items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3 dark:border-emerald-800 dark:bg-emerald-900/25"
                  data-testid="schedule-own-booking-picked"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check size={14} strokeWidth={3} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="sr-only">{t('gameDetails.whenWhere.ownPicked', { court: courtName(b.courtId) })}</span>
                    <span aria-hidden className="block truncate text-sm font-semibold text-gray-900 dark:text-white">
                      {courtName(b.courtId)}
                    </span>
                    <span className="block text-xs tabular-nums text-gray-600 dark:text-gray-300">
                      {day.format(new Date(b.start))} · {formatRange(b.start, b.end)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={onUndo}
                    className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-gray-700 hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-200 dark:hover:bg-emerald-900/40"
                  >
                    <Undo2 size={15} aria-hidden />
                    {t('gameDetails.courts.clubBusyUndo')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onPick(b)}
                  data-testid="schedule-own-booking"
                  className={`flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-gray-200 px-3 text-start transition-[background-color,transform] duration-150 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 active:scale-[0.99] dark:border-gray-700 dark:hover:bg-gray-800 ${pressScaleGuard}`}
                >
                  <CalendarCheck size={18} aria-hidden className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{courtName(b.courtId)}</span>
                    <span className="block text-xs tabular-nums text-gray-500 dark:text-gray-400">
                      {day.format(new Date(b.start))} · {formatRange(b.start, b.end)}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                    {t('gameDetails.whenWhere.ownUse')}
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <ChevronDown size={15} aria-hidden />
          {t('gameDetails.whenWhere.ownMore', { count: hidden })}
        </button>
      ) : null}
    </section>
  );
}
