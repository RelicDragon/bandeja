import { useMemo } from 'react';
import type { BooktimeMyClubRow } from '@/api/booktime';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { BooktimeAdjacentBookingGroup } from './BooktimeAdjacentBookingGroup';
import { BooktimeBookingRow } from './BooktimeBookingRow';
import { groupAdjacentBooktimeBookings } from './groupAdjacentBooktimeBookings';

type UpcomingBooking = BooktimeBookingRecord & { clubId?: string };

function resolveClub(
  booking: UpcomingBooking,
  clubById: Map<string, BooktimeMyClubRow>,
  clubIdOf: (booking: UpcomingBooking) => string | undefined,
): BooktimeMyClubRow | undefined {
  const clubId = clubIdOf(booking);
  if (clubId) return clubById.get(clubId);
  if (clubById.size === 1) return clubById.values().next().value;
  return undefined;
}

type Props = {
  bookings: UpcomingBooking[];
  clubById: Map<string, BooktimeMyClubRow>;
  showClubName?: boolean;
  allowedHoursToCancel?: number;
  compact?: boolean;
  limit?: number;
  clubTimezone?: string | null;
  clubIdOf?: (booking: UpcomingBooking) => string | undefined;
  onCanceled?: (bookingId: string) => void;
  onRefreshSnapshot?: (options?: { force?: boolean }) => Promise<boolean>;
};

export function BooktimeUpcomingBookingsList({
  bookings,
  clubById,
  showClubName = false,
  allowedHoursToCancel = 12,
  compact = false,
  limit,
  clubTimezone,
  clubIdOf = (booking) => booking.clubId,
  onCanceled,
  onRefreshSnapshot,
}: Props) {
  const entries = useMemo(
    () =>
      groupAdjacentBooktimeBookings(bookings, {
        clubIdOf,
        timeZone: clubTimezone ?? undefined,
      }),
    [bookings, clubIdOf, clubTimezone],
  );
  const visibleEntries = limit != null ? entries.slice(0, limit) : entries;

  return (
    <ul className="space-y-2">
      {visibleEntries.map((entry) => {
        if (entry.kind === 'group') {
          const club = resolveClub(entry.bookings[0]!, clubById, clubIdOf);
          if (!club) return null;
          return (
            <BooktimeAdjacentBookingGroup
              key={entry.bookings.map((booking) => booking.uuid).join('-')}
              bookings={entry.bookings}
              club={club}
              showClubName={showClubName}
              allowedHoursToCancel={allowedHoursToCancel}
              compact={compact}
              clubTimezone={clubTimezone}
              onRefreshSnapshot={onRefreshSnapshot}
              onCanceled={onCanceled}
            />
          );
        }

        const club = resolveClub(entry.booking, clubById, clubIdOf);
        if (!club) return null;
        return (
          <BooktimeBookingRow
            key={`${club.clubId}-${entry.booking.uuid}`}
            booking={entry.booking}
            club={club}
            showClubName={showClubName}
            allowedHoursToCancel={allowedHoursToCancel}
            compact={compact}
            clubTimezone={clubTimezone}
            onRefreshSnapshot={onRefreshSnapshot}
            onCanceled={() => onCanceled?.(entry.booking.uuid)}
          />
        );
      })}
    </ul>
  );
}
