import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useBooktimeMyClubs } from '@/hooks/useBooktimeMyClubs';
import { useBooktimeAllUpcoming } from '@/hooks/useBooktimeAllUpcoming';
import { BooktimeUpcomingBookingsList } from './BooktimeUpcomingBookingsList';
import { BooktimeBookingsLoading } from './BooktimeBookingsLoading';
import { MyTabConnectBanner } from './MyTabConnectBanner';
import { useBooktimeCancelPoliciesForClubs } from './useBooktimeCancelPolicy';
import { useShellNavStore } from '@/store/shellNavStore';

export function MyTabBookingsSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeTab = useShellNavStore((s) => s.activeTab);
  const { data: myClubs, reload: reloadMyClubs } = useBooktimeMyClubs(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const clubs = useMemo(() => myClubs?.clubs ?? [], [myClubs?.clubs]);
  const { bookings, loading, removeBooking } = useBooktimeAllUpcoming(clubs, true, refreshKey);
  const allowedHoursToCancelByClubId = useBooktimeCancelPoliciesForClubs(
    clubs,
    myClubs != null && myClubs.connectedCount > 0,
  );

  const prevActiveTab = useRef(activeTab);
  useEffect(() => {
    if (activeTab !== 'calendar') {
      prevActiveTab.current = activeTab;
      return;
    }
    if (prevActiveTab.current !== 'calendar') {
      setRefreshKey((k) => k + 1);
      void reloadMyClubs();
    }
    prevActiveTab.current = activeTab;
  }, [activeTab, reloadMyClubs]);

  if (!myClubs) return null;

  const showConnectBanner =
    myClubs.cityBooktimeClubCount > 0 && myClubs.connectedCount === 0;

  if (showConnectBanner) {
    return <MyTabConnectBanner />;
  }

  if (myClubs.connectedCount === 0) return null;

  const previewLimit = 3;
  const clubById = new Map(clubs.map((c) => [c.clubId, c]));

  return (
    <section className="mb-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('club.booktime.myTabUpcomingTitle')}</h3>
        <button
          type="button"
          onClick={() => navigate('/profile/connected-clubs')}
          className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >
          {t('club.booktime.seeAllBookings')}
        </button>
      </div>

      {loading ? (
        <BooktimeBookingsLoading />
      ) : bookings.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('club.booktime.noUpcomingAny')}</p>
      ) : (
        <BooktimeUpcomingBookingsList
          bookings={bookings}
          clubById={clubById}
          showClubName={clubs.filter((c) => c.connected).length > 1}
          allowedHoursToCancelByClubId={allowedHoursToCancelByClubId}
          compact
          limit={previewLimit}
          onCanceled={removeBooking}
        />
      )}
    </section>
  );
}
