import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AnimatedMount } from '@/components/motion/AnimatedMount';
import type { MyTabClubBookingsSnapshot } from '@/hooks/useMyTabClubBookings';
import { connectedClubRowToBookingListClub } from '@/hooks/connectedBookingClubs';
import type { MyTabUnlinkedBookingsState } from '@/hooks/useMyTabUnlinkedBookings';
import { PADELOO_DEFAULT_CANCEL_HOURS } from '@/integrations/padeloo/config';
import { KLIKTEREN_DEFAULT_CANCEL_HOURS } from '@/integrations/klikteren/config';
import { BooktimeUpcomingBookingsList } from './BooktimeUpcomingBookingsList';
import { useBooktimeCancelPoliciesForClubs } from './useBooktimeCancelPolicy';

type Props = {
  booktime: MyTabClubBookingsSnapshot;
  unlinked: MyTabUnlinkedBookingsState;
};

export function MyTabUnlinkedBookingsSection({ booktime, unlinked }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { myClubs, clubs, removeBooking } = booktime;
  const { bookings, visible, linkedGamesByBookingId, reloadLinkedGames } = unlinked;
  const bookingListRows = useMemo(() => clubs.map(connectedClubRowToBookingListClub), [clubs]);
  const booktimeRows = useMemo(
    () => bookingListRows.filter((c) => c.integrationType === 'BOOKTIME'),
    [bookingListRows],
  );
  const clubById = useMemo(
    () => new Map(bookingListRows.filter((c) => c.connected).map((c) => [c.clubId, c])),
    [bookingListRows],
  );
  const allowedHoursToCancelByClubId = useBooktimeCancelPoliciesForClubs(
    booktimeRows,
    myClubs != null && myClubs.connectedCount > 0,
  );
  const cancelHoursByClubId = useMemo(() => {
    const map = new Map(allowedHoursToCancelByClubId);
    for (const club of clubs) {
      if (club.integrationType === 'PADELOO' && club.connected && club.padelooClubId) {
        map.set(club.clubId, PADELOO_DEFAULT_CANCEL_HOURS);
      }
      if (club.integrationType === 'KLIKTEREN' && club.connected && club.klikterenVenueId) {
        map.set(club.clubId, KLIKTEREN_DEFAULT_CANCEL_HOURS);
      }
    }
    return map;
  }, [allowedHoursToCancelByClubId, clubs]);

  if (!visible) return null;

  return (
    <AnimatedMount layout className="mb-6">
      <section data-testid="my-tab-unlinked-bookings">
        <h2 className="mb-1 text-xl font-semibold text-gray-900 dark:text-white">
          {t('club.booktime.myTabUnlinkedTitle')}
        </h2>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          {t('club.booktime.myTabUnlinkedHint')}
        </p>
        <BooktimeUpcomingBookingsList
          bookings={bookings}
          clubById={clubById}
          showClubName
          allowedHoursToCancelByClubId={cancelHoursByClubId}
          compact
          animateEntries
          onCanceled={removeBooking}
          linkedGamesByBookingId={linkedGamesByBookingId}
          onLinkedGamesReload={() => void reloadLinkedGames()}
        />
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => navigate('/profile/connected-clubs')}
            className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
          >
            {t('club.booktime.seeAllBookings')}
          </button>
        </div>
      </section>
    </AnimatedMount>
  );
}
