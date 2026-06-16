import { useCallback, useMemo, useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import type { BooktimeMyClubRow } from '@/api/booktime';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { BooktimeAdjacentBookingGroup } from './BooktimeAdjacentBookingGroup';
import { BooktimeBookingRow } from './BooktimeBookingRow';
import { groupAdjacentBooktimeBookings } from './groupAdjacentBooktimeBookings';
import { resolveBooktimeMyClubTimezone } from './booktimeBookingUtils';
import { DEFAULT_BOOKTIME_CANCEL_HOURS, resolveBooktimeCancelHoursForClub } from './useBooktimeCancelPolicy';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { BOOKING_LIST_CONTAINER_VARIANTS, BOOKING_LIST_ITEM_VARIANTS } from './booktimeListMotion';

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
  allowedHoursToCancelByClubId?: ReadonlyMap<string, number>;
  compact?: boolean;
  limit?: number;
  clubTimezone?: string | null;
  clubIdOf?: (booking: UpcomingBooking) => string | undefined;
  onCanceled?: (bookingId: string) => void;
  onRefreshSnapshot?: (options?: { force?: boolean }) => Promise<boolean>;
  animateEntries?: boolean;
};

export function BooktimeUpcomingBookingsList({
  bookings,
  clubById,
  showClubName = false,
  allowedHoursToCancel = DEFAULT_BOOKTIME_CANCEL_HOURS,
  allowedHoursToCancelByClubId,
  compact = false,
  limit,
  clubTimezone,
  clubIdOf = (booking) => booking.clubId,
  onCanceled,
  onRefreshSnapshot,
  animateEntries = false,
}: Props) {
  const reduceMotion = usePrefersReducedMotion();
  const shouldAnimateEntries = animateEntries && !reduceMotion;
  const entryVariants: Variants | undefined = shouldAnimateEntries
    ? BOOKING_LIST_ITEM_VARIANTS
    : undefined;
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const resolveAllowedHours = (clubId: string | undefined) =>
    resolveBooktimeCancelHoursForClub(clubId, allowedHoursToCancelByClubId, allowedHoursToCancel);
  const resolveClubTimezone = useCallback(
    (club: BooktimeMyClubRow) => clubTimezone ?? resolveBooktimeMyClubTimezone(club),
    [clubTimezone],
  );
  const entries = useMemo(
    () =>
      groupAdjacentBooktimeBookings(bookings, {
        clubIdOf,
        timeZone: clubTimezone ?? undefined,
        timeZoneOf: (booking) => {
          const club = resolveClub(booking, clubById, clubIdOf);
          return club ? resolveClubTimezone(club) : undefined;
        },
      }),
    [bookings, clubById, clubIdOf, clubTimezone, resolveClubTimezone],
  );
  const visibleEntries = limit != null ? entries.slice(0, limit) : entries;

  const listClassName = 'space-y-2';
  const listContent = visibleEntries.map((entry) => {
        if (entry.kind === 'group') {
          const club = resolveClub(entry.bookings[0]!, clubById, clubIdOf);
          if (!club) return null;
          const clubAllowedHours = resolveAllowedHours(club.clubId);
          const groupId = entry.bookings.map((booking) => booking.uuid).join('-');
          return (
            <BooktimeAdjacentBookingGroup
              key={groupId}
              bookings={entry.bookings}
              club={club}
              showClubName={showClubName}
              allowedHoursToCancel={clubAllowedHours}
              compact={compact}
              clubTimezone={resolveClubTimezone(club)}
              onRefreshSnapshot={onRefreshSnapshot}
              expandableActions
              actionsExpanded={selectedBookingId === groupId}
              onToggleActions={() =>
                setSelectedBookingId((prev) => (prev === groupId ? null : groupId))
              }
              onCanceled={(bookingId) => {
                setSelectedBookingId((prev) =>
                  prev === groupId || prev === bookingId ? null : prev,
                );
                onCanceled?.(bookingId);
              }}
              entryVariants={entryVariants}
            />
          );
        }

        const club = resolveClub(entry.booking, clubById, clubIdOf);
        if (!club) return null;
        const clubAllowedHours = resolveAllowedHours(club.clubId);
        const bookingId = entry.booking.uuid;
        return (
          <BooktimeBookingRow
            key={`${club.clubId}-${bookingId}`}
            booking={entry.booking}
            club={club}
            showClubName={showClubName}
            allowedHoursToCancel={clubAllowedHours}
            compact={compact}
            clubTimezone={resolveClubTimezone(club)}
            onRefreshSnapshot={onRefreshSnapshot}
            expandableActions
            actionsExpanded={selectedBookingId === bookingId}
            onToggleActions={() =>
              setSelectedBookingId((prev) => (prev === bookingId ? null : bookingId))
            }
            onCanceled={() => {
              setSelectedBookingId((prev) => (prev === bookingId ? null : prev));
              onCanceled?.(bookingId);
            }}
            entryVariants={entryVariants}
          />
        );
      });

  if (shouldAnimateEntries) {
    return (
      <motion.ul
        className={listClassName}
        variants={BOOKING_LIST_CONTAINER_VARIANTS}
        initial="hidden"
        animate="show"
      >
        {listContent}
      </motion.ul>
    );
  }

  return (
    <ul className={listClassName}>
      {listContent}
    </ul>
  );
}
