import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import type { BooktimeMyClubRow } from '@/api/booktime';
import type { Club, Court } from '@/types';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { deriveGameTimeFromBookings } from '@shared/gameBooking/deriveGameTimeFromBookings';
import { buildBookingSnapshots } from '@shared/gameBooking/buildBookingSnapshots';
import type { BookingSelectionLimits } from '@shared/gameBooking/computeBookingSelectionLimits';
import { useBooktimeLinkedGames } from '@/hooks/useBooktimeLinkedGames';
import { BooktimeBookingRow } from '@/components/booktime/BooktimeBookingRow';
import { BooktimeAdjacentBookingGroup } from '@/components/booktime/BooktimeAdjacentBookingGroup';
import { groupAdjacentBooktimeBookings } from '@/components/booktime/groupAdjacentBooktimeBookings';
import { booktimeRowToClub } from '@/components/booktime/booktimeBookingUtils';
import { buildSelectedBookingRecordsSyncKey } from '@/components/gameLocationTime/locationTimeDraft';
import { resolveBookingSelectionAfterDeselect } from '@/components/gameLocationTime/resolveBookingSelectionAfterDeselect';
import { useReservationGridSync } from '@/components/gameLocationTime/useReservationGridSync';
import { pruneSelectedBookingsToAvailable } from './pruneSelectedBookingsToAvailable';
import { ExistingReservationEmptyState } from './ExistingReservationEmptyState';

type ReservationsStripProps = {
  club: Club;
  courts: Court[];
  bookingMatchCourts?: Court[];
  companyId: string;
  clubTimezone: string;
  dateBookings: BooktimeBookingRecord[];
  bookings: BooktimeBookingRecord[];
  loading: boolean;
  loaded: boolean;
  selectedBookingIds: string[];
  onSelectedBookingIdsChange: (ids: string[], records: BooktimeBookingRecord[]) => void;
  onToggleBooking: (bookingId: string) => void;
  selectionLimits: BookingSelectionLimits;
  onDerivedTimeChange?: (start: string | null, end: string | null) => void;
  onEmptyReserveNow?: () => void;
  onEmptyGameOnly?: () => void;
};

function ReservationRowWithLinkedGames({
  booking,
  club,
  selected,
  selectable,
  dimmed,
  disableDeselect,
  onToggle,
  clubTimezone,
  highlighted,
  cardRef,
}: {
  booking: BooktimeBookingRecord;
  club: ReturnType<typeof booktimeRowToClub>;
  selected: boolean;
  selectable: boolean;
  dimmed: boolean;
  disableDeselect: boolean;
  onToggle: () => void;
  clubTimezone: string;
  highlighted: boolean;
  cardRef: (el: HTMLElement | null) => void;
}) {
  const { linkedGames } = useBooktimeLinkedGames(booking.uuid);
  return (
    <li
      ref={cardRef}
      data-booking-id={booking.uuid}
      className={
        highlighted
          ? 'rounded-xl ring-2 ring-primary-400 dark:ring-primary-500 transition-shadow'
          : undefined
      }
    >
      <BooktimeBookingRow
        nested
        booking={booking}
        club={{
          clubId: club.id,
          clubName: club.name,
          avatar: null,
          companyId: club.integrationConfig?.companyId ?? null,
          connected: true,
          phoneNumber: null,
          scoutOptIn: false,
          cityTimezone: clubTimezone,
          courts: (club.courts ?? []).map((c) => ({
            id: c.id,
            name: c.name,
            externalCourtId: c.externalCourtId ?? null,
            integrationCourtName: c.integrationCourtName ?? null,
          })),
        }}
        selectable={selectable}
        selected={selected}
        dimmed={dimmed}
        disableDeselect={disableDeselect}
        linkedGames={linkedGames}
        onToggleSelect={onToggle}
        clubTimezone={clubTimezone}
        compact
      />
    </li>
  );
}

export function ReservationsStrip({
  club,
  courts,
  bookingMatchCourts,
  companyId,
  clubTimezone,
  dateBookings,
  bookings,
  loading,
  loaded,
  selectedBookingIds,
  onSelectedBookingIdsChange,
  onToggleBooking,
  selectionLimits,
  onDerivedTimeChange,
  onEmptyReserveNow,
  onEmptyGameOnly,
}: ReservationsStripProps) {
  const { t } = useTranslation();
  const gridSync = useReservationGridSync();
  const matchCourts = bookingMatchCourts ?? courts;

  const selectedBookings = useMemo(
    () => bookings.filter((b) => selectedBookingIds.includes(b.uuid)),
    [bookings, selectedBookingIds],
  );

  const onSelectedBookingIdsChangeRef = useRef(onSelectedBookingIdsChange);
  onSelectedBookingIdsChangeRef.current = onSelectedBookingIdsChange;
  const onDerivedTimeChangeRef = useRef(onDerivedTimeChange);
  onDerivedTimeChangeRef.current = onDerivedTimeChange;
  const lastSyncedBookingRecordsKeyRef = useRef('');

  const derived = useMemo(() => {
    if (selectedBookings.length === 0) return { startTime: null, endTime: null };
    const snapshots = buildBookingSnapshots(selectedBookings, matchCourts, {
      timeZone: clubTimezone,
    });
    return deriveGameTimeFromBookings(snapshots, { timeZone: clubTimezone });
  }, [selectedBookings, matchCourts, clubTimezone]);

  useEffect(() => {
    onDerivedTimeChangeRef.current?.(derived.startTime, derived.endTime);
  }, [derived.startTime, derived.endTime]);

  useEffect(() => {
    if (loading || !loaded) return;
    const pruned = pruneSelectedBookingsToAvailable({
      selectedBookingIds,
      availableBookings: dateBookings,
      selectionLimits,
    });
    if (!pruned) return;
    onSelectedBookingIdsChangeRef.current(pruned.ids, pruned.records);
  }, [loading, loaded, dateBookings, selectedBookingIds, selectionLimits]);

  useEffect(() => {
    if (selectedBookingIds.length === 0) {
      lastSyncedBookingRecordsKeyRef.current = '';
      return;
    }
    const records = bookings.filter((b) => selectedBookingIds.includes(b.uuid));
    if (records.length !== selectedBookingIds.length) return;
    const syncKey = buildSelectedBookingRecordsSyncKey(selectedBookingIds, records);
    if (lastSyncedBookingRecordsKeyRef.current === syncKey) return;
    lastSyncedBookingRecordsKeyRef.current = syncKey;
    onSelectedBookingIdsChangeRef.current(selectedBookingIds, records);
  }, [bookings, selectedBookingIds]);

  const atMax = selectedBookingIds.length >= selectionLimits.max;
  const highlightedSet = useMemo(
    () => new Set(gridSync?.highlightedBookingIds ?? []),
    [gridSync?.highlightedBookingIds],
  );

  const booktimeMyClubRow: BooktimeMyClubRow = {
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
  const clubRow = booktimeRowToClub(booktimeMyClubRow);

  const handleGroupToggle = (groupIds: string[]) => {
    const groupSelected = groupIds.every((id) => selectedBookingIds.includes(id));
    if (groupSelected) {
      const nextIds = resolveBookingSelectionAfterDeselect(
        selectedBookingIds,
        groupIds,
        selectionLimits,
      );
      onSelectedBookingIdsChange(nextIds, bookings.filter((b) => nextIds.includes(b.uuid)));
      return;
    }
    const nextIds = [...new Set([...selectedBookingIds, ...groupIds])];
    if (nextIds.length > selectionLimits.max) return;
    onSelectedBookingIdsChange(nextIds, bookings.filter((b) => nextIds.includes(b.uuid)));
  };

  const bookingEntries = useMemo(
    () =>
      groupAdjacentBooktimeBookings(dateBookings, {
        timeZone: clubTimezone,
      }),
    [dateBookings, clubTimezone],
  );

  const registerCardRef = useCallback(
    (bookingId: string) => (el: HTMLElement | null) => {
      gridSync?.registerCardRef(bookingId, el);
    },
    [gridSync],
  );

  if (loading) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
        {t('common.loading')}
      </p>
    );
  }

  if (dateBookings.length === 0) {
    if (!loaded) {
      return (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
          {t('common.loading')}
        </p>
      );
    }
    return (
      <ExistingReservationEmptyState
        onReserveNow={onEmptyReserveNow}
        onGameOnly={onEmptyGameOnly}
      />
    );
  }

  return (
    <div className="space-y-2 pb-3 border-b border-gray-100 dark:border-gray-800">
      {selectedBookingIds.length < selectionLimits.min ? (
        <motion.p
          key="selection-counter"
          initial={{ scale: 0.96 }}
          animate={{ scale: 1 }}
          className="text-xs font-medium text-gray-600 dark:text-gray-400"
          aria-live="polite"
        >
          {t('createGame.locationTime.selectionCounter', {
            min: selectionLimits.min,
            max: selectionLimits.max,
            players: selectionLimits.playersPerCourt === 2 ? '1v1' : '2v2',
          })}
        </motion.p>
      ) : null}
      <ul className="space-y-2">
        {bookingEntries.map((entry) => {
          if (entry.kind === 'group') {
            const groupIds = entry.bookings.map((booking) => booking.uuid);
            const groupSelected = groupIds.every((id) => selectedBookingIds.includes(id));
            const slotsToAdd = groupIds.filter((id) => !selectedBookingIds.includes(id)).length;
            const dimmed = !groupSelected && selectedBookingIds.length + slotsToAdd > selectionLimits.max;
            return (
              <li key={groupIds.join('-')} ref={registerCardRef(groupIds[0]!)}>
                <BooktimeAdjacentBookingGroup
                  nested
                  bookings={entry.bookings}
                  club={booktimeMyClubRow}
                  compact
                  clubTimezone={clubTimezone}
                  selectable
                  selected={groupSelected}
                  dimmed={dimmed}
                  disableDeselect={false}
                  onToggleSelect={() => handleGroupToggle(groupIds)}
                />
              </li>
            );
          }

          const booking = entry.booking;
          const selected = selectedBookingIds.includes(booking.uuid);
          const dimmed = !selected && atMax;
          return (
            <ReservationRowWithLinkedGames
              key={booking.uuid}
              booking={booking}
              club={clubRow}
              selected={selected}
              selectable
              dimmed={dimmed}
              disableDeselect={false}
              onToggle={() => onToggleBooking(booking.uuid)}
              clubTimezone={clubTimezone}
              highlighted={highlightedSet.has(booking.uuid)}
              cardRef={registerCardRef(booking.uuid)}
            />
          );
        })}
      </ul>
    </div>
  );
}
