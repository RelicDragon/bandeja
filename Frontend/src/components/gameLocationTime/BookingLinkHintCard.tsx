import { useTranslation } from 'react-i18next';
import { Link2 } from 'lucide-react';
import type { BooktimeMyClubRow } from '@/api/booktime';
import type { Club, Court } from '@/types';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import {
  formatBooktimeBookingSlotRange,
  resolveCourtForBooking,
} from '@/components/booktime/booktimeBookingUtils';
import { useBooktimeLinkedGames } from '@/hooks/useBooktimeLinkedGames';
import type { ResolvedDisplaySettings } from '@/utils/displayPreferences';

type BookingLinkHintLineProps = {
  booking: BooktimeBookingRecord;
  clubRow: BooktimeMyClubRow;
  clubTimezone: string;
  displaySettings: ResolvedDisplaySettings;
};

function BookingLinkHintLine({
  booking,
  clubRow,
  clubTimezone,
  displaySettings,
}: BookingLinkHintLineProps) {
  const { t } = useTranslation();
  const { linkedGames } = useBooktimeLinkedGames(booking.uuid);
  const courtInfo = resolveCourtForBooking(
    booking,
    clubRow,
    t('club.booktime.unknownCourt'),
  );
  const windowLabel = formatBooktimeBookingSlotRange(booking, {
    timezone: clubTimezone,
    displaySettings,
  });
  const sharedGames = linkedGames.map((g) => g.name).filter(Boolean);

  return (
    <li className="flex flex-col gap-0.5 text-sm text-gray-800 dark:text-gray-200">
      <span className="font-medium">
        {t('createGame.locationTime.linkHintLine', {
          court: courtInfo.courtName,
          window: windowLabel,
        })}
      </span>
      {sharedGames.length > 0 ? (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {t('createGame.locationTime.alsoUsedIn', { games: sharedGames.join(', ') })}
        </span>
      ) : null}
    </li>
  );
}

type BookingLinkHintCardProps = {
  club: Club;
  courts: Court[];
  companyId: string;
  clubTimezone: string;
  selectedBookings: BooktimeBookingRecord[];
  displaySettings: ResolvedDisplaySettings;
};

export function BookingLinkHintCard({
  club,
  courts,
  companyId,
  clubTimezone,
  selectedBookings,
  displaySettings,
}: BookingLinkHintCardProps) {
  const { t } = useTranslation();

  if (selectedBookings.length === 0) return null;

  const clubRow: BooktimeMyClubRow = {
    clubId: club.id,
    clubName: club.name,
    avatar: null,
    companyId,
    connected: true,
    phoneNumber: null,
    scoutOptIn: false,
    cityTimezone: club.city?.timezone ?? null,
    courts: (club.courts ?? courts).map((c) => ({
      id: c.id,
      name: c.name,
      externalCourtId: c.externalCourtId ?? null,
      integrationCourtName: c.integrationCourtName ?? null,
    })),
  };

  return (
    <div
      data-testid="booking-link-hint-card"
      className="rounded-xl border border-emerald-200/80 dark:border-emerald-800/80 bg-emerald-50/60 dark:bg-emerald-950/30 px-3 py-2.5 space-y-2"
    >
      <div className="flex items-start gap-2">
        <Link2 size={16} className="shrink-0 mt-0.5 text-emerald-700 dark:text-emerald-300" />
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
            {t('createGame.locationTime.linkHintTitle')}
          </p>
          <p className="text-xs text-emerald-800/80 dark:text-emerald-200/80">
            {t('createGame.locationTime.linkHintBody')}
          </p>
        </div>
      </div>
      <ul className="space-y-1.5 pl-6 list-none">
        {selectedBookings.map((booking) => (
          <BookingLinkHintLine
            key={booking.uuid}
            booking={booking}
            clubRow={clubRow}
            clubTimezone={clubTimezone}
            displaySettings={displaySettings}
          />
        ))}
      </ul>
    </div>
  );
}
