import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BooktimeMyClubRow } from '@/api/booktime';
import { clubsApi } from '@/api/clubs';
import { BooktimeBookingRow } from './BooktimeBookingRow';
import { BooktimeBookingsLoading } from './BooktimeBookingsLoading';
import { useBooktimeCancelPolicy } from './useBooktimeCancelPolicy';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import type { Club } from '@/types';
import { getBooktimeClient, hydrateBooktimeSession } from '@/integrations/booktime/session';
import { useBooktimeSnapshotRefresh } from '@/hooks/useBooktimeSnapshotRefresh';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { CourtDisplayName } from '@/components/CourtDisplayName';
import { bookingMatchesClubCourts, formatBooktimeBookingWhen, resolveCourtForBooking } from './booktimeBookingUtils';

type Props = {
  club: BooktimeMyClubRow;
  onChanged: () => void;
};

export function ClubBookingsBlock({ club, onChanged }: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const [upcoming, setUpcoming] = useState<BooktimeBookingRecord[]>([]);
  const [past, setPast] = useState<BooktimeBookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [clubEntity, setClubEntity] = useState<Club | null>(null);
  const clubTimezone = clubEntity?.city?.timezone ?? null;
  const allowedHoursToCancel = useBooktimeCancelPolicy(club, club.connected);
  const { refreshSnapshot } = useBooktimeSnapshotRefresh(
    clubEntity ?? undefined,
    new Date(),
    club.connected && !!clubEntity
  );

  useEffect(() => {
    void clubsApi.getById(club.clubId).then((res) => {
      if (res.data) setClubEntity(res.data);
    });
  }, [club.clubId]);

  const loadBookings = useCallback(async () => {
    if (!club.connected || !club.companyId) {
      setUpcoming([]);
      setPast([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await hydrateBooktimeSession(club.clubId, club.companyId);
      const client = getBooktimeClient(club.clubId, club.companyId);
      if (!client.isAuthenticated) {
        setUpcoming([]);
        setPast([]);
        return;
      }
      const [upRes, prevRes] = await Promise.all([
        client.getUpcomingBookings(0, 30),
        client.getPreviousBookings(0, 20),
      ]);
      const filter = (b: BooktimeBookingRecord) => bookingMatchesClubCourts(b, club.courts);
      setUpcoming((upRes.bookings ?? []).filter(filter));
      setPast((prevRes.bookings ?? []).filter(filter));
    } catch (err) {
      console.error('Failed to load club bookings', err);
    } finally {
      setLoading(false);
    }
  }, [club]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  if (!club.connected) return null;

  return (
    <div className="space-y-3 border-t border-gray-100 dark:border-gray-800 px-4 py-4">
      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 p-3 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('club.booktime.upcomingTitle')}</h3>
        {loading ? (
          <BooktimeBookingsLoading />
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('club.booktime.noUpcoming')}</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((booking) => (
              <BooktimeBookingRow
                key={booking.uuid}
                booking={booking}
                club={club}
                allowedHoursToCancel={allowedHoursToCancel}
                onRefreshSnapshot={refreshSnapshot}
                clubTimezone={clubTimezone}
                onCanceled={() => {
                  onChanged();
                  void loadBookings();
                }}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 p-3 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('club.booktime.pastTitle')}</h3>
        {loading ? null : past.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('club.booktime.noPast')}</p>
        ) : (
          <ul className="space-y-2">
            {past.map((booking) => {
              const courtInfo = resolveCourtForBooking(booking, club, t('club.booktime.unknownCourt'));
              return (
              <li
                key={booking.uuid}
                className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-600 dark:text-gray-300"
              >
                <CourtDisplayName
                  name={courtInfo.courtName}
                  integrationName={courtInfo.integrationCourtName}
                  primaryClassName="font-medium text-gray-900 dark:text-white"
                  secondaryClassName="text-[10px] text-gray-500 dark:text-gray-400"
                />
                <span className="block text-xs text-gray-500 mt-0.5">
                  {formatBooktimeBookingWhen(booking, { timezone: clubTimezone, displaySettings, t })}
                </span>
              </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
