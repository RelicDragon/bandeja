import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { useBooktimeMyClubs } from '@/hooks/useBooktimeMyClubs';
import { useBooktimeAllUpcoming } from '@/hooks/useBooktimeAllUpcoming';
import { BooktimeUpcomingBookingsList } from './BooktimeUpcomingBookingsList';
import { BooktimeBookingsCardsSkeleton } from './BooktimeBookingsCardsSkeleton';
import { MyTabConnectBanner } from './MyTabConnectBanner';
import { useBooktimeCancelPoliciesForClubs } from './useBooktimeCancelPolicy';
import { useShellNavStore } from '@/store/shellNavStore';

const PREVIEW_LIMIT = 3;

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

  if (!myClubs) {
    return <BooktimeBookingsCardsSkeleton count={PREVIEW_LIMIT} compact />;
  }

  const showConnectBanner =
    myClubs.cityBooktimeClubCount > 0 && myClubs.connectedCount === 0;

  if (showConnectBanner) {
    return <MyTabConnectBanner />;
  }

  if (myClubs.connectedCount === 0) return null;

  const clubById = new Map(clubs.map((c) => [c.clubId, c]));

  return (
    <div className="space-y-3">
      {loading ? (
        <BooktimeBookingsCardsSkeleton count={PREVIEW_LIMIT} compact />
      ) : bookings.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('club.booktime.noUpcomingAny')}</p>
      ) : (
        <>
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
          <div className="relative flex items-center justify-center">
            <button
              type="button"
              onClick={() => navigate('/profile/connected-clubs')}
              className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
              {t('club.booktime.seeAllBookings')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/profile/connected-clubs?tab=integrations')}
              className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center p-1 text-primary-600 hover:opacity-80 dark:text-primary-400"
              aria-label={t('club.booktime.tabIntegrations')}
            >
              <Settings size={18} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
