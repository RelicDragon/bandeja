import { Calendar } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BooktimeMyClubRow } from '@/api/booktime';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { useBooktimeAllUpcoming } from '@/hooks/useBooktimeAllUpcoming';
import { BooktimeUpcomingBookingsList } from './BooktimeUpcomingBookingsList';
import { BooktimeBookingsLoading } from './BooktimeBookingsLoading';
import { BooktimePastBookingsSection } from './BooktimePastBookingsSection';
import { useBooktimeCancelPoliciesForClubs } from './useBooktimeCancelPolicy';

type Props = {
  clubs: BooktimeMyClubRow[];
  refreshKey: number;
  onBookingsChanged: () => void;
};

export function ConnectedClubsBookingsTab({ clubs, refreshKey, onBookingsChanged }: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);
  const combinedRefreshKey = refreshKey + localRefreshKey;
  const connectedClubs = useMemo(() => clubs.filter((c) => c.connected && c.companyId), [clubs]);
  const { bookings: upcoming, loading: upcomingLoading, removeBooking } = useBooktimeAllUpcoming(
    clubs,
    true,
    combinedRefreshKey
  );
  const allowedHoursToCancelByClubId = useBooktimeCancelPoliciesForClubs(clubs, connectedClubs.length > 0);
  const clubById = useMemo(() => new Map(clubs.map((c) => [c.clubId, c])), [clubs]);

  const handleCanceled = (bookingId: string) => {
    removeBooking(bookingId);
    setLocalRefreshKey((k) => k + 1);
    onBookingsChanged();
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
            clubById={clubById}
            showClubName
            allowedHoursToCancelByClubId={allowedHoursToCancelByClubId}
            onCanceled={handleCanceled}
          />
        )}
      </section>

      <BooktimePastBookingsSection
        clubs={clubs}
        displaySettings={displaySettings}
        refreshKey={combinedRefreshKey}
        showClubName
      />
    </div>
  );
}
