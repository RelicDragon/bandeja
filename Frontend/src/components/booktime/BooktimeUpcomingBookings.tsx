import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Club } from '@/types';
import type { BooktimeMyClubRow } from '@/api/booktime';
import { useBooktimeUpcomingBookings } from '@/hooks/useBooktimeUpcomingBookings';
import { BooktimeBookingRow } from './BooktimeBookingRow';
import { BooktimeBookingsLoading } from './BooktimeBookingsLoading';
import { useBooktimeCancelPolicy } from './useBooktimeCancelPolicy';

type Props = {
  club: Club;
  companyId: string;
  connected: boolean;
  enabled: boolean;
  onRefreshSnapshot: (options?: { force?: boolean }) => Promise<boolean>;
  refreshKey?: number;
};

function clubToMyClubRow(club: Club, companyId: string, connected: boolean): BooktimeMyClubRow {
  return {
    clubId: club.id,
    clubName: club.name,
    avatar: club.avatar ?? null,
    companyId,
    connected,
    phoneNumber: null,
    scoutOptIn: true,
    courts: (club.courts ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      externalCourtId: c.externalCourtId ?? null,
    })),
  };
}

export function BooktimeUpcomingBookings({
  club,
  companyId,
  connected,
  enabled,
  onRefreshSnapshot,
  refreshKey = 0,
}: Props) {
  const { t } = useTranslation();
  const clubRow = clubToMyClubRow(club, companyId, connected);
  const allowedHoursToCancel = useBooktimeCancelPolicy(clubRow, enabled && connected);
  const { bookings, loading, error, reload, removeBooking } = useBooktimeUpcomingBookings(
    club,
    companyId,
    connected,
    enabled
  );

  useEffect(() => {
    void reload();
  }, [refreshKey, reload]);

  if (!enabled || !connected) return null;

  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 p-3 space-y-3">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
        {t('club.booktime.upcomingTitle')}
      </h3>

      {loading ? (
        <BooktimeBookingsLoading />
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{t('club.booktime.upcomingLoadFailed')}</p>
      ) : bookings.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('club.booktime.noUpcoming')}</p>
      ) : (
        <ul className="space-y-2">
          {bookings.map((booking) => (
            <BooktimeBookingRow
              key={booking.uuid}
              booking={booking}
              club={clubRow}
              allowedHoursToCancel={allowedHoursToCancel}
              onRefreshSnapshot={onRefreshSnapshot}
              clubTimezone={club.city?.timezone}
              onCanceled={() => {
                removeBooking(booking.uuid);
                void reload();
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
