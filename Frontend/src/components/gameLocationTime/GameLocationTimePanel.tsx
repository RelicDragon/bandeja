import { useCallback, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { Club, Court, EntityType } from '@/types';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { TimeSlotsPanel } from './TimeSlotsPanel';
import { BooktimeRealBookingSection } from './BooktimeRealBookingSection';
import { LocationTimeSummaryBar } from './LocationTimeSummaryBar';
import { BookingLinkHintCard } from './BookingLinkHintCard';
import { BookingTimeOverrideSection } from './BookingTimeOverrideSection';
import { ReservationsStrip } from './ReservationsStrip';
import { ReservationGridSyncProvider } from './ReservationGridSyncProvider';
import { useClubDateReservations, findBookingRecords } from './useClubDateReservations';
import { resolveBookingSelectionAfterDeselect } from './resolveBookingSelectionAfterDeselect';
import type { LocationTimeMode } from './LocationTimeMode';
import type { BookingSelectionLimits } from '@shared/gameBooking/computeBookingSelectionLimits';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { courtHasActiveBookingIntegration } from '@/utils/clubBookingIntegration';
import { useAuthStore } from '@/store/authStore';
import { buildBookingSnapshots } from '@shared/gameBooking/buildBookingSnapshots';
import { deriveGameTimeFromBookings } from '@shared/gameBooking/deriveGameTimeFromBookings';

export type GameLocationTimePanelProps = {
  mode: 'create' | 'edit';
  entityType: EntityType;
  club: Club | undefined;
  locationTimeMode: LocationTimeMode;
  skipRealCourtBooking: boolean;
  onSkipRealCourtBookingChange: (value: boolean) => void;
  selectedCourtIds: string[];
  courts: Court[];
  bookingMatchCourts?: Court[];
  selectedDate?: Date;
  selectedBookingIds?: string[];
  onSelectedBookingIdsChange?: (ids: string[], records: BooktimeBookingRecord[]) => void;
  bookingSelectionLimits?: BookingSelectionLimits;
  companyId?: string;
  booktimeConnected?: boolean;
  onDerivedTimeChange?: (start: string | null, end: string | null) => void;
  timeSlotsChildren: ReactNode;
  dateSection: ReactNode;
  courtSection: ReactNode;
  authGateSection?: ReactNode;
  needsBooktimeAuth?: boolean;
  derivedSummary?: { startTime: string | null; endTime: string | null; count: number };
  preselectedBanner?: boolean;
  fallbackSelectedBookings?: BooktimeBookingRecord[];
  timeOverride?: boolean;
  onTimeOverrideChange?: (value: boolean) => void;
  overrideStartTime?: string;
  overrideEndTime?: string;
  onOverrideTimesChange?: (start: string, end: string) => void;
};

export function GameLocationTimePanel({
  mode,
  entityType: _entityType,
  club,
  locationTimeMode,
  skipRealCourtBooking,
  onSkipRealCourtBookingChange,
  selectedCourtIds,
  courts,
  bookingMatchCourts,
  selectedDate,
  selectedBookingIds = [],
  onSelectedBookingIdsChange,
  bookingSelectionLimits,
  companyId,
  booktimeConnected = false,
  onDerivedTimeChange,
  timeSlotsChildren,
  dateSection,
  courtSection,
  authGateSection,
  needsBooktimeAuth,
  derivedSummary,
  preselectedBanner,
  fallbackSelectedBookings,
  timeOverride = false,
  onTimeOverrideChange,
  overrideStartTime,
  overrideEndTime,
  onOverrideTimesChange,
}: GameLocationTimePanelProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const matchCourts = bookingMatchCourts ?? courts;

  const integratedCourts = useMemo(
    () =>
      selectedCourtIds
        .map((id) => courts.find((c) => c.id === id))
        .filter((c): c is Court => c != null && courtHasActiveBookingIntegration(club, c)),
    [selectedCourtIds, courts, club],
  );

  const reservationsEnabled =
    club != null &&
    companyId != null &&
    selectedDate != null &&
    bookingSelectionLimits != null &&
    onSelectedBookingIdsChange != null &&
    booktimeConnected &&
    !needsBooktimeAuth;

  const clubReservations = useClubDateReservations({
    club,
    companyId: companyId ?? '',
    selectedDate: selectedDate ?? new Date(),
    enabled: reservationsEnabled,
    matchCourts,
  });

  const handleToggleBooking = useCallback(
    (bookingId: string) => {
      if (!onSelectedBookingIdsChange || !bookingSelectionLimits) return;
      const isSelected = selectedBookingIds.includes(bookingId);
      if (isSelected) {
        const nextIds = resolveBookingSelectionAfterDeselect(
          selectedBookingIds,
          [bookingId],
          bookingSelectionLimits,
        );
        onSelectedBookingIdsChange(
          nextIds,
          findBookingRecords(clubReservations.bookings, nextIds),
        );
        return;
      }
      if (selectedBookingIds.length >= bookingSelectionLimits.max) return;
      const nextIds = [...selectedBookingIds, bookingId];
      onSelectedBookingIdsChange(
        nextIds,
        findBookingRecords(clubReservations.bookings, nextIds),
      );
    },
    [
      onSelectedBookingIdsChange,
      bookingSelectionLimits,
      selectedBookingIds,
      clubReservations.bookings,
    ],
  );

  const selectedBookings = useMemo(() => {
    const fromApi = findBookingRecords(clubReservations.bookings, selectedBookingIds);
    if (fromApi.length >= selectedBookingIds.length || !fallbackSelectedBookings?.length) {
      return fromApi;
    }
    const fallbackById = new Map(fallbackSelectedBookings.map((booking) => [booking.uuid, booking]));
    return selectedBookingIds
      .map((id) => fromApi.find((booking) => booking.uuid === id) ?? fallbackById.get(id))
      .filter((booking): booking is BooktimeBookingRecord => booking != null);
  }, [clubReservations.bookings, selectedBookingIds, fallbackSelectedBookings]);

  const unionWindow = useMemo(() => {
    if (selectedBookings.length === 0) return { startTime: null, endTime: null };
    const snapshots = buildBookingSnapshots(selectedBookings, matchCourts, {
      timeZone: clubReservations.clubTimezone,
    });
    return deriveGameTimeFromBookings(snapshots, {
      timeZone: clubReservations.clubTimezone,
    });
  }, [selectedBookings, matchCourts, clubReservations.clubTimezone]);

  const derivedStart = unionWindow.startTime;
  const derivedEnd = unionWindow.endTime;
  const effectiveStart =
    timeOverride && overrideStartTime ? overrideStartTime : derivedStart;
  const effectiveEnd = timeOverride && overrideEndTime ? overrideEndTime : derivedEnd;

  const handleOverrideChange = useCallback(
    (value: boolean) => {
      if (!onTimeOverrideChange || !onOverrideTimesChange) return;
      if (!value && timeOverride) {
        toast(t('createGame.locationTime.overrideResetToast'));
      }
      onTimeOverrideChange(value);
      if (value && derivedStart && derivedEnd) {
        onOverrideTimesChange(derivedStart, derivedEnd);
      }
    },
    [
      onTimeOverrideChange,
      onOverrideTimesChange,
      timeOverride,
      derivedStart,
      derivedEnd,
      t,
    ],
  );

  const linkHintSection =
    locationTimeMode === 'bookings' &&
    selectedBookings.length > 0 &&
    club &&
    companyId ? (
      <BookingLinkHintCard
        club={club}
        courts={courts}
        companyId={companyId}
        clubTimezone={clubReservations.clubTimezone}
        selectedBookings={selectedBookings}
        displaySettings={displaySettings}
      />
    ) : null;

  const overrideSection =
    locationTimeMode === 'bookings' &&
    selectedBookings.length > 0 &&
    derivedStart &&
    derivedEnd &&
    onTimeOverrideChange &&
    onOverrideTimesChange ? (
      <BookingTimeOverrideSection
        enabled={timeOverride}
        onEnabledChange={handleOverrideChange}
        startTime={effectiveStart ?? derivedStart}
        endTime={effectiveEnd ?? derivedEnd}
        onStartTimeChange={(v) =>
          onOverrideTimesChange(v, effectiveEnd ?? derivedEnd)
        }
        onEndTimeChange={(v) =>
          onOverrideTimesChange(effectiveStart ?? derivedStart, v)
        }
        minStart={derivedStart}
        maxEnd={derivedEnd}
      />
    ) : null;

  const reservationsStrip =
    reservationsEnabled && club && companyId && selectedDate && bookingSelectionLimits ? (
      <ReservationsStrip
        club={club}
        courts={courts}
        bookingMatchCourts={matchCourts}
        companyId={companyId}
        clubTimezone={clubReservations.clubTimezone}
        dateBookings={clubReservations.dateBookings}
        bookings={clubReservations.bookings}
        loading={clubReservations.authLoading || clubReservations.bookingsLoading}
        selectedBookingIds={selectedBookingIds}
        onSelectedBookingIdsChange={onSelectedBookingIdsChange}
        onToggleBooking={handleToggleBooking}
        selectionLimits={bookingSelectionLimits}
        onDerivedTimeChange={onDerivedTimeChange}
      />
    ) : null;

  const panelContent = (
    <div className="space-y-4">
      {preselectedBanner ? (
        <div className="rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50/60 dark:bg-primary-950/30 px-3 py-2 text-sm text-primary-800 dark:text-primary-200">
          {t('createGame.locationTime.preselectedBanner')}
        </div>
      ) : null}

      <TimeSlotsPanel
        dateSection={dateSection}
        courtSection={courtSection}
        timeSlotsChildren={timeSlotsChildren}
        needsBooktimeAuth={needsBooktimeAuth}
        authGateSection={authGateSection}
        reservationsStrip={reservationsStrip}
        hintSection={
          club && locationTimeMode === 'timeSlots' ? (
            <BooktimeRealBookingSection
              mode={mode}
              club={club}
              courts={integratedCourts}
              skipRealCourtBooking={skipRealCourtBooking}
              onSkipRealCourtBookingChange={onSkipRealCourtBookingChange}
            />
          ) : null
        }
        linkHintSection={linkHintSection}
        overrideSection={overrideSection}
      />

      {derivedSummary && locationTimeMode === 'bookings' ? (
        <LocationTimeSummaryBar
          bookingCount={derivedSummary.count}
          startTime={derivedSummary.startTime}
          endTime={derivedSummary.endTime}
          displaySettings={displaySettings}
          visible={derivedSummary.count > 0}
        />
      ) : null}
    </div>
  );

  if (!reservationsEnabled || !bookingSelectionLimits || !onSelectedBookingIdsChange) {
    return panelContent;
  }

  return (
    <ReservationGridSyncProvider
      enabled={clubReservations.dateBookings.length > 0}
      dateBookings={clubReservations.dateBookings}
      clubTimezone={clubReservations.clubTimezone}
      selectedBookingIds={selectedBookingIds}
      onSelectedBookingIdsChange={onSelectedBookingIdsChange}
      onToggleBooking={handleToggleBooking}
    >
      {panelContent}
    </ReservationGridSyncProvider>
  );
}
