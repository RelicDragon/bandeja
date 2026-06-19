import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Settings } from 'lucide-react';
import type { MyTabBooktimeSnapshot } from '@/hooks/useMyTabBooktime';
import { BooktimeUpcomingBookingsList } from './BooktimeUpcomingBookingsList';
import { BooktimeBookingsCardsSkeleton } from './BooktimeBookingsCardsSkeleton';
import { MyTabConnectBanner } from './MyTabConnectBanner';
import { useBooktimeCancelPoliciesForClubs } from './useBooktimeCancelPolicy';

const PREVIEW_LIMIT = 3;

type Props = {
  booktime: MyTabBooktimeSnapshot;
};

export function MyTabBookingsSection({ booktime }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { myClubs, clubs, bookings, bookingsLoading, reloadBookings, removeBooking } = booktime;
  const clubById = useMemo(() => new Map(clubs.map((c) => [c.clubId, c])), [clubs]);
  const allowedHoursToCancelByClubId = useBooktimeCancelPoliciesForClubs(
    clubs,
    myClubs != null && myClubs.connectedCount > 0,
  );

  if (!myClubs) {
    return <BooktimeBookingsCardsSkeleton count={PREVIEW_LIMIT} compact />;
  }

  const showConnectBanner =
    myClubs.cityBooktimeClubCount > 0 && myClubs.connectedCount === 0;

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
              allowedHoursToCancelByClubId={allowedHoursToCancelByClubId}
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
