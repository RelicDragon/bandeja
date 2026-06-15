import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { buildSelectedBookingRecordsSyncKey } from '@/components/gameLocationTime/locationTimeDraft';
import { motion } from 'framer-motion';
import { CalendarX2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Club, Court } from '@/types';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { deriveGameTimeFromBookings } from '@shared/gameBooking/deriveGameTimeFromBookings';
import { buildBookingSnapshots } from '@shared/gameBooking/buildBookingSnapshots';
import type { BookingSelectionLimits } from '@shared/gameBooking/computeBookingSelectionLimits';
import { useBooktimeUpcomingBookings } from '@/hooks/useBooktimeUpcomingBookings';
import { useBooktimeClubAuth } from '@/hooks/useBooktimeClubAuth';
import { useBooktimeLinkedGames } from '@/hooks/useBooktimeLinkedGames';
import { getClubTimezone } from '@/hooks/useGameTimeDuration';
import { BooktimeBookingRow } from '@/components/booktime/BooktimeBookingRow';
import { BooktimeAdjacentBookingGroup } from '@/components/booktime/BooktimeAdjacentBookingGroup';
import { groupAdjacentBooktimeBookings } from '@/components/booktime/groupAdjacentBooktimeBookings';
import { booktimeRowToClub } from '@/components/booktime/booktimeBookingUtils';
import { BookingTimeOverrideSection } from './BookingTimeOverrideSection';
type BookingsPickerPanelProps = {
  club: Club;
  courts: Court[];
  companyId: string;
  enabled: boolean;
  selectedBookingIds: string[];
  onSelectedBookingIdsChange: (ids: string[], records: BooktimeBookingRecord[]) => void;
  selectionLimits: BookingSelectionLimits;
  timeOverride: boolean;
  onTimeOverrideChange: (value: boolean) => void;
  overrideStartTime?: string;
  overrideEndTime?: string;
  onOverrideTimesChange: (start: string, end: string) => void;
  onSwitchToTimeSlots: () => void;
  onDerivedTimeChange?: (start: string | null, end: string | null) => void;
};

function BookingRowWithLinkedGames({
  booking,
  club,
  selected,
  selectable,
  dimmed,
  disableDeselect,
  onToggle,
  clubTimezone,
}: {
  booking: BooktimeBookingRecord;
  club: ReturnType<typeof booktimeRowToClub>;
  selected: boolean;
  selectable: boolean;
  dimmed: boolean;
  disableDeselect: boolean;
  onToggle: () => void;
  clubTimezone: string;
}) {
  const { linkedGames } = useBooktimeLinkedGames(booking.uuid);
  return (
    <BooktimeBookingRow
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
  );
}

export function BookingsPickerPanel({
  club,
  courts,
  companyId,
  enabled,
  selectedBookingIds,
  onSelectedBookingIdsChange,
  selectionLimits,
  timeOverride,
  onTimeOverrideChange,
  overrideStartTime,
  overrideEndTime,
  onOverrideTimesChange,
  onSwitchToTimeSlots,
  onDerivedTimeChange,
}: BookingsPickerPanelProps) {
  const { t } = useTranslation();
  const { status: auth, loading: authLoading } = useBooktimeClubAuth(club.id, enabled);
  const { bookings, loading } = useBooktimeUpcomingBookings(
    club,
    companyId,
    Boolean(auth?.connected),
    enabled,
    courts,
  );

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
    const snapshots = buildBookingSnapshots(selectedBookings, courts);
    return deriveGameTimeFromBookings(snapshots);
  }, [selectedBookings, courts]);

  useEffect(() => {
    onDerivedTimeChangeRef.current?.(derived.startTime, derived.endTime);
  }, [derived.startTime, derived.endTime]);

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
  const clubTimezone = getClubTimezone(club);
  const clubRow = booktimeRowToClub({
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
  });

  const handleToggle = (bookingId: string) => {
    const isSelected = selectedBookingIds.includes(bookingId);
    if (isSelected) {
      if (selectedBookingIds.length <= selectionLimits.min) return;
      const nextIds = selectedBookingIds.filter((id) => id !== bookingId);
      onSelectedBookingIdsChange(nextIds, bookings.filter((b) => nextIds.includes(b.uuid)));
      return;
    }
    if (atMax) return;
    const nextIds = [...selectedBookingIds, bookingId];
    onSelectedBookingIdsChange(nextIds, bookings.filter((b) => nextIds.includes(b.uuid)));
  };

  const handleGroupToggle = (groupIds: string[]) => {
    const groupSelected = groupIds.every((id) => selectedBookingIds.includes(id));
    if (groupSelected) {
      const nextIds = selectedBookingIds.filter((id) => !groupIds.includes(id));
      if (nextIds.length < selectionLimits.min) return;
      onSelectedBookingIdsChange(nextIds, bookings.filter((b) => nextIds.includes(b.uuid)));
      return;
    }
    const nextIds = [...new Set([...selectedBookingIds, ...groupIds])];
    if (nextIds.length > selectionLimits.max) return;
    onSelectedBookingIdsChange(nextIds, bookings.filter((b) => nextIds.includes(b.uuid)));
  };

  const bookingEntries = useMemo(
    () =>
      groupAdjacentBooktimeBookings(bookings, {
        timeZone: clubTimezone,
      }),
    [bookings, clubTimezone],
  );

  const handleOverrideChange = (value: boolean) => {
    if (!value && timeOverride) {
      toast(t('createGame.locationTime.overrideResetToast'));
    }
    onTimeOverrideChange(value);
    if (value && derived.startTime && derived.endTime) {
      onOverrideTimesChange(derived.startTime, derived.endTime);
    }
  };

  if (authLoading || loading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400 py-4">{t('common.loading')}</p>;
  }

  if (bookings.length === 0) {
    return (
      <div className="flex flex-col items-center text-center py-8 px-4 space-y-3">
        <CalendarX2 size={40} className="text-gray-300 dark:text-gray-600" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t('createGame.locationTime.emptyBookings')}
        </p>
        <button
          type="button"
          onClick={onSwitchToTimeSlots}
          className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >
          {t('createGame.locationTime.emptyBookingsCta')}
        </button>
      </div>
    );
  }

  const effectiveStart = timeOverride && overrideStartTime ? overrideStartTime : derived.startTime;
  const effectiveEnd = timeOverride && overrideEndTime ? overrideEndTime : derived.endTime;

  return (
    <div className="space-y-3">
      <motion.p
        key={selectedBookingIds.length}
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
      <ul className="space-y-2">
        {bookingEntries.map((entry) => {
          if (entry.kind === 'group') {
            const groupIds = entry.bookings.map((booking) => booking.uuid);
            const groupSelected = groupIds.every((id) => selectedBookingIds.includes(id));
            const slotsToAdd = groupIds.filter((id) => !selectedBookingIds.includes(id)).length;
            const dimmed = !groupSelected && selectedBookingIds.length + slotsToAdd > selectionLimits.max;
            const disableDeselect =
              groupSelected && selectedBookingIds.length - groupIds.length < selectionLimits.min;
            return (
              <BooktimeAdjacentBookingGroup
                key={groupIds.join('-')}
                bookings={entry.bookings}
                club={clubRow}
                compact
                clubTimezone={clubTimezone}
                selectable
                selected={groupSelected}
                dimmed={dimmed}
                disableDeselect={disableDeselect}
                onToggleSelect={() => handleGroupToggle(groupIds)}
              />
            );
          }

          const booking = entry.booking;
          const selected = selectedBookingIds.includes(booking.uuid);
          const dimmed = !selected && atMax;
          const atMinSelection = selected && selectedBookingIds.length <= selectionLimits.min;
          return (
            <BookingRowWithLinkedGames
              key={booking.uuid}
              booking={booking}
              club={clubRow}
              selected={selected}
              selectable={!atMinSelection}
              dimmed={dimmed}
              disableDeselect={atMinSelection}
              onToggle={() => handleToggle(booking.uuid)}
              clubTimezone={clubTimezone}
            />
          );
        })}
      </ul>
      {selectedBookings.length > 0 && derived.startTime && derived.endTime ? (
        <BookingTimeOverrideSection
          enabled={timeOverride}
          onEnabledChange={handleOverrideChange}
          startTime={effectiveStart ?? derived.startTime}
          endTime={effectiveEnd ?? derived.endTime}
          onStartTimeChange={(v) => onOverrideTimesChange(v, effectiveEnd ?? derived.endTime!)}
          onEndTimeChange={(v) => onOverrideTimesChange(effectiveStart ?? derived.startTime!, v)}
          minStart={derived.startTime}
          maxEnd={derived.endTime}
        />
      ) : null}
    </div>
  );
}
