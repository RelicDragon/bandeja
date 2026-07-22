import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Settings } from 'lucide-react';
import type { MyTabClubBookingsSnapshot } from '@/hooks/useMyTabClubBookings';
import { connectedClubRowToBookingListClub } from '@/hooks/connectedBookingClubs';
import { PADELOO_DEFAULT_CANCEL_HOURS } from '@/integrations/padeloo/config';
import { KLIKTEREN_DEFAULT_CANCEL_HOURS } from '@/integrations/klikteren/config';
import { BooktimeUpcomingBookingsList } from './BooktimeUpcomingBookingsList';
import { BooktimeBookingsCardsSkeleton } from './BooktimeBookingsCardsSkeleton';
import { MyTabConnectBanner } from './MyTabConnectBanner';
import { useBooktimeCancelPoliciesForClubs } from './useBooktimeCancelPolicy';

const PREVIEW_LIMIT = 3;

type Props = {
  booktime: MyTabClubBookingsSnapshot;
};

export function MyTabBookingsSection({ booktime }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { myClubs, clubs, bookings, bookingsLoading, reloadBookings, removeBooking } = booktime;
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

  if (!myClubs) {
    return <BooktimeBookingsCardsSkeleton count={PREVIEW_LIMIT} compact />;
  }

  const showConnectBanner =
    myClubs.cityClubCount > 0 && myClubs.connectedCount === 0;

  if (showConnectBanner) {
    return <MyTabConnectBanner />;
  }

  if (myClubs.connectedCount === 0) return null;

  const actionFooter = (
    <div className="relative flex items-center justify-center">
      {bookings.length > 0 ? (
        <button
          type="button"
          onClick={() => navigate('/profile/connected-clubs')}
          className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >
          {t('club.booktime.seeAllBookings')}
        </button>
      ) : null}
      <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-1">
        <button
          type="button"
          onClick={() => reloadBookings()}
          className="flex items-center p-1 text-primary-600 hover:opacity-80 dark:text-primary-400"
          aria-label="Reload bookings"
        >
          <RefreshCw size={18} strokeWidth={2} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => navigate('/profile/connected-clubs?tab=integrations')}
          className="flex items-center p-1 text-primary-600 hover:opacity-80 dark:text-primary-400"
          aria-label={t('club.booktime.tabIntegrations')}
        >
          <Settings size={18} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {bookingsLoading ? (
        <BooktimeBookingsCardsSkeleton count={PREVIEW_LIMIT} compact />
      ) : (
        <>
          {bookings.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('club.booktime.noUpcomingAny')}</p>
          ) : (
            <BooktimeUpcomingBookingsList
              bookings={bookings}
              clubById={clubById}
              showClubName
              allowedHoursToCancelByClubId={cancelHoursByClubId}
              compact
              limit={PREVIEW_LIMIT}
              animateEntries
              onCanceled={removeBooking}
            />
          )}
          {actionFooter}
        </>
      )}
    </div>
  );
}
