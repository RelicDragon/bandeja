import { ChevronDown } from 'lucide-react';
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
  const [expanded, setExpanded] = useState(false);
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
    <section className="mb-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 p-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {t('club.booktime.myTabUpcomingTitle')}
          </h3>
          {!loading && bookings.length > 0 ? (
            <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gray-900/5 px-1.5 text-[10px] font-semibold tabular-nums text-gray-600 dark:bg-white/10 dark:text-gray-300">
              {bookings.length}
            </span>
          ) : null}
        </span>
        <ChevronDown
          size={18}
          strokeWidth={2}
          className={`shrink-0 text-gray-500 transition-transform duration-300 ease-out motion-reduce:transition-none dark:text-gray-400 ${expanded ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-3 pt-3">
            {loading ? (
              <BooktimeBookingsLoading />
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
                  limit={previewLimit}
                  onCanceled={removeBooking}
                />
                <button
                  type="button"
                  onClick={() => navigate('/profile/connected-clubs')}
                  className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                >
                  {t('club.booktime.seeAllBookings')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
