/**
 * Removing the club or the date and time while bookings are linked: per
 * booking, keep it at the club (it is only removed from the game — the
 * default, nothing is lost) or cancel it there (only offered when the
 * provider can and the organizer made it). Done on save, before the club or
 * time goes.
 */
import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
import { providerDisplayName } from '@shared/gameBooking/reservationCopy';
import type { LinkedBookingPayload } from '@/features/court-reservations/courtReservationsInput';
import '@/features/court-reservations/courtReservations.css';

export type ReleaseChoice = 'keep' | 'cancel';

export function ReleaseBookingsSection({
  links,
  courtName,
  formatRange,
  clubName,
  reason,
  choices,
  onChange,
}: {
  links: readonly { link: LinkedBookingPayload; canCancel: boolean }[];
  courtName: (courtId: string) => string;
  formatRange: (start: string, end: string) => string;
  clubName: string;
  reason: 'club' | 'time';
  choices: Readonly<Record<string, ReleaseChoice>>;
  onChange: (externalBookingId: string, choice: ReleaseChoice) => void;
}) {
  const { t } = useTranslation();
  if (links.length === 0) return null;
  return (
    <section
      className="cr-enter space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/60 dark:bg-amber-900/20"
      data-testid="schedule-release-bookings"
    >
      <p className="flex items-start gap-2 text-sm font-semibold text-gray-900 dark:text-white">
        <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        {t(reason === 'club' ? 'gameDetails.whenWhere.releaseTitleClub' : 'gameDetails.whenWhere.releaseTitleTime', { count: links.length })}
      </p>
      <ul className="space-y-2">
        {links.map(({ link, canCancel }) => {
          const choice = choices[link.externalBookingId] ?? 'keep';
          const name = (link.courtId && courtName(link.courtId)) || t('gameDetails.whenWhere.someCourt');
          const when = link.bookingStart && link.bookingEnd ? formatRange(link.bookingStart, link.bookingEnd) : '';
          return (
            <li key={link.externalBookingId} className="rounded-xl bg-white p-2.5 dark:bg-gray-900">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {[name, providerDisplayName(link.externalBookingProvider), when].filter(Boolean).join(' · ')}
              </p>
              <div role="radiogroup" aria-label={name} className="mt-1 flex flex-col">
                {(['keep', ...(canCancel ? (['cancel'] as const) : [])] as ReleaseChoice[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={choice === value}
                    onClick={() => onChange(link.externalBookingId, value)}
                    className="flex min-h-[44px] items-center gap-3 rounded-lg px-1 text-start text-sm text-gray-800 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-100 dark:hover:bg-gray-800"
                  >
                    <span
                      aria-hidden
                      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
                        choice === value ? 'border-primary-600 dark:border-primary-400' : 'border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      {choice === value ? <span className="cr-pop h-2 w-2 rounded-full bg-primary-600 dark:bg-primary-400" /> : null}
                    </span>
                    <span className={value === 'cancel' ? 'text-red-700 dark:text-red-300' : ''}>
                      {value === 'keep'
                        ? t('gameDetails.whenWhere.releaseKeep', { club: clubName || t('gameDetails.whenWhere.theClub') })
                        : t('gameDetails.whenWhere.releaseCancel', { club: clubName || t('gameDetails.whenWhere.theClub') })}
                    </span>
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
