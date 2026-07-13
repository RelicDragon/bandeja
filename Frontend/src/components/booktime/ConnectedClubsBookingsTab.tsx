import { Calendar } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { connectedClubRowToBooktimeRow, connectedClubRowToBookingListClub, type ConnectedBookingClubRow } from '@/hooks/connectedBookingClubs';
import { PADELOO_DEFAULT_CANCEL_HOURS } from '@/integrations/padeloo/config';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { useAllUpcomingClubBookings } from '@/hooks/useAllUpcomingClubBookings';
import { BooktimeUpcomingBookingsList } from './BooktimeUpcomingBookingsList';
import { BooktimeBookingsLoading } from './BooktimeBookingsLoading';
import { ClubPastBookingsSection } from './ClubPastBookingsSection';
import { useBooktimeCancelPoliciesForClubs } from './useBooktimeCancelPolicy';

type Props = {
  clubs: ConnectedBookingClubRow[];
  refreshKey: number;
};

export function ConnectedClubsBookingsTab({ clubs, refreshKey }: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const [pastRefreshKey, setPastRefreshKey] = useState(0);
  const connectedClubs = useMemo(
    () => clubs.filter((c) => c.connected && (c.companyId || c.padelooClubId)),
    [clubs],
  );
  const { bookings: upcoming, loading: upcomingLoading, removeBooking } = useAllUpcomingClubBookings(
    clubs,
    true,
    refreshKey,
  );
  const booktimeRows = useMemo(
    () =>
      clubs
        .filter((c) => c.integrationType === 'BOOKTIME')
        .map(connectedClubRowToBooktimeRow),
    [clubs],
  );
  const bookingListClubById = useMemo(
    () => new Map(clubs.filter((c) => c.connected).map((c) => [c.clubId, connectedClubRowToBookingListClub(c)])),
    [clubs],
  );
  const allowedHoursToCancelByClubId = useBooktimeCancelPoliciesForClubs(
    booktimeRows,
    connectedClubs.length > 0,
  );
  const cancelHoursByClubId = useMemo(() => {
    const map = new Map(allowedHoursToCancelByClubId);
    for (const club of clubs) {
      if (club.integrationType === 'PADELOO' && club.connected && club.padelooClubId) {
        map.set(club.clubId, PADELOO_DEFAULT_CANCEL_HOURS);
      }
    }
    return map;
  }, [allowedHoursToCancelByClubId, clubs]);

  const handleCanceled = (bookingId: string) => {
    removeBooking(bookingId);
    setPastRefreshKey((k) => k + 1);
  };

  if (connectedClubs.length === 0) {
    return (
      <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
        {t('club.booktime.noUpcomingAny')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 p-3 space-y-3">
        <div className="flex min-w-0 items-center gap-2">
          <Calendar
            size={18}
            strokeWidth={2}
            className="shrink-0 text-gray-500 dark:text-gray-400"
            aria-hidden
          />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {t('club.booktime.myTabUpcomingTitle')}
          </p>
        </div>
        {upcomingLoading ? (
          <BooktimeBookingsLoading />
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('club.booktime.noUpcomingAny')}</p>
        ) : (
          <BooktimeUpcomingBookingsList
            bookings={upcoming}
            clubById={bookingListClubById}
            showClubName
            allowedHoursToCancelByClubId={cancelHoursByClubId}
            onCanceled={handleCanceled}
          />
        )}
      </section>

      <ClubPastBookingsSection
        clubs={connectedClubs}
        displaySettings={displaySettings}
        refreshKey={refreshKey + pastRefreshKey}
        showClubName
      />
    </div>
  );
}
