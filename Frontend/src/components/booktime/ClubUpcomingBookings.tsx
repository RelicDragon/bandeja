import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Club } from '@/types';
import { clubHasBookingIntegration } from '@shared/clubIntegration';
import { connectedClubRowToBookingListClub } from '@/hooks/connectedBookingClubs';
import type { ConnectedBookingClubRow } from '@/hooks/connectedBookingClubs';
import { useAllUpcomingClubBookings } from '@/hooks/useAllUpcomingClubBookings';
import { BooktimeUpcomingBookingsList } from './BooktimeUpcomingBookingsList';
import { BooktimeBookingsLoading } from './BooktimeBookingsLoading';
import { useBooktimeCancelPolicy } from './useBooktimeCancelPolicy';
import { PADELOO_DEFAULT_CANCEL_HOURS } from '@/integrations/padeloo/config';
import { isBooktimeClub, isPadelooClub } from '@shared/clubIntegration';

type Props = {
  club: Club;
  connected: boolean;
  enabled: boolean;
  onRefreshSnapshot: (options?: { force?: boolean }) => Promise<boolean>;
  refreshKey?: number;
};

function clubToConnectedRow(club: Club, connected: boolean): ConnectedBookingClubRow {
  const base = {
    clubId: club.id,
    clubName: club.name,
    avatar: club.avatar ?? null,
    connected,
    scoutOptIn: true,
    cityTimezone: club.city?.timezone ?? null,
    courts: (club.courts ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      externalCourtId: c.externalCourtId ?? null,
      integrationCourtName: c.integrationCourtName ?? null,
    })),
    phoneNumber: club.phone ?? null,
    email: club.email ?? null,
  };

  if (isPadelooClub(club)) {
    const clubId = (club.integrationConfig as { clubId?: number } | null)?.clubId ?? null;
    return {
      ...base,
      integrationType: 'PADELOO',
      padelooClubId: clubId,
    };
  }

  return {
    ...base,
    integrationType: 'BOOKTIME',
    companyId: (club.integrationConfig as { companyId?: string } | null)?.companyId ?? null,
  };
}

export function ClubUpcomingBookings({
  club,
  connected,
  enabled,
  onRefreshSnapshot,
  refreshKey = 0,
}: Props) {
  const { t } = useTranslation();
  const connectedRow = useMemo(() => clubToConnectedRow(club, connected), [club, connected]);
  const clubRow = useMemo(() => connectedClubRowToBookingListClub(connectedRow), [connectedRow]);
  const clubById = useMemo(() => new Map([[clubRow.clubId, clubRow]]), [clubRow]);
  const allowedHoursToCancel = useBooktimeCancelPolicy(
    isBooktimeClub(club) ? clubRow : null,
    enabled && connected && isBooktimeClub(club),
  );
  const cancelHoursByClubId = useMemo(() => {
    const map = new Map<string, number>();
    if (isBooktimeClub(club)) {
      map.set(club.id, allowedHoursToCancel);
    }
    if (isPadelooClub(club)) {
      map.set(club.id, PADELOO_DEFAULT_CANCEL_HOURS);
    }
    return map;
  }, [allowedHoursToCancel, club]);

  const { bookings, loading, removeBooking } = useAllUpcomingClubBookings(
    [connectedRow],
    enabled && connected && clubHasBookingIntegration(club),
    refreshKey,
  );

  if (!enabled || !connected || !clubHasBookingIntegration(club)) return null;

  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 p-3 space-y-3">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
        {t('club.booktime.myTabUpcomingTitle')}
      </p>
      {loading ? (
        <BooktimeBookingsLoading />
      ) : bookings.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('club.booktime.noUpcomingAny')}</p>
      ) : (
        <BooktimeUpcomingBookingsList
          bookings={bookings}
          clubById={clubById}
          allowedHoursToCancelByClubId={cancelHoursByClubId}
          onRefreshSnapshot={onRefreshSnapshot}
          onCanceled={removeBooking}
        />
      )}
    </section>
  );
}
