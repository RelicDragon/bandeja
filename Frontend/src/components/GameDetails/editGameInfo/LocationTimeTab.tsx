import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Club, Court, EntityType, Game } from '@/types';
import { GameLocationTimePanel } from '@/components/gameLocationTime/GameLocationTimePanel';
import { useGameLocationTimeState } from '@/components/gameLocationTime/useGameLocationTimeState';
import { useEditGameLocationTimeBookingSync } from '@/components/gameLocationTime/useEditGameLocationTimeBookingSync';
import type { EditLocationTimeDraft } from '@/components/gameLocationTime/locationTimeDraft';
import { linkedBookingToRecord } from '@/components/booktime/booktimeBookingUtils';
import { GameStartSection } from '@/components/createGame/GameStartSection';
import { CreateGameClubSection } from '@/components/createGame/CreateGameClubSection';
import { CreateGameCourtSection } from '@/components/createGame/CreateGameCourtSection';
import { CreateGameDateSection } from '@/components/createGame/CreateGameDateSection';
import { useBooktimeLiveApiEnabled } from '@/hooks/useBooktimeLiveApiEnabled';
import { supportsClubBookingFlow } from '@shared/gameBooking/supportsClubBookingFlow';
import { clubHasBookingIntegration } from '@shared/clubIntegration';
import { computePendingBookingUnlinks } from '@/components/gameLocationTime/computePendingBookingUnlinks';
import { PendingBookingUnlinkHint } from '@/components/gameLocationTime/PendingBookingUnlinkHint';
import { filterClubsBySport } from '@/utils/courtSport';
import type { RefObject, ReactNode } from 'react';
import type { BooktimeSnapshotBanner } from '@/hooks/useBooktimeSnapshotRefresh';

type LocationTimeTabProps = {
  game: Game;
  entityType: EntityType;
  clubs: Club[];
  courts: Court[];
  selectedClub: string;
  selectedCourtIds: string[];
  selectedCourt: string;
  hasBookedCourt: boolean;
  onSelectClub?: (id: string) => void;
  onSelectCourt: (id: string) => void;
  onSelectCourtIds?: (ids: string[]) => void;
  onToggleHasBookedCourt: (value: boolean) => void;
  selectedDate: Date;
  selectedTime: string;
  duration: number;
  showDatePicker: boolean;
  onDateChange: (date: Date) => void;
  onTimeChange: (time: string) => void;
  onDurationChange: (duration: number) => void;
  onShowDatePickerChange: (open: boolean) => void;
  generateTimeOptions: () => string[];
  generateTimeOptionsForDate: (date: Date) => string[];
  canAccommodateDuration: (time: string, duration: number) => boolean;
  getAdjustedStartTime: (clickedTime: string, duration: number) => string | null;
  getTimeSlotsForDuration: (startTime: string, duration: number) => string[];
  isSlotHighlighted: (time: string) => boolean;
  dateInputRef: RefObject<HTMLInputElement | null>;
  pendingRemoveBookingIds: string[];
  onDraftChange: (draft: EditLocationTimeDraft) => void;
  snapshotOverlayEnabled?: boolean;
  snapshotLoading?: boolean;
  snapshotBannerState?: BooktimeSnapshotBanner;
  willBookOnCreate?: boolean;
  needsBooktimeAuth?: boolean;
  booktimeFixedDates?: Date[];
  slotsLoading?: boolean;
  connectedPhone?: string | null;
  bookableDaysHint?: number | null;
  authGateSection?: ReactNode;
  clubBookingFlowActive?: boolean;
  booktimeCompanyId?: string | null;
  booktimeConnected?: boolean;
};

export function LocationTimeTab({
  game,
  entityType,
  clubs,
  courts,
  selectedClub,
  selectedCourtIds,
  selectedCourt,
  hasBookedCourt,
  onSelectClub,
  onSelectCourt,
  onSelectCourtIds,
  onToggleHasBookedCourt,
  selectedDate,
  selectedTime,
  duration,
  showDatePicker,
  onDateChange,
  onTimeChange,
  onDurationChange,
  onShowDatePickerChange,
  generateTimeOptions,
  generateTimeOptionsForDate,
  canAccommodateDuration,
  getAdjustedStartTime,
  getTimeSlotsForDuration,
  isSlotHighlighted,
  dateInputRef,
  pendingRemoveBookingIds,
  onDraftChange,
  snapshotOverlayEnabled = false,
  snapshotLoading = false,
  snapshotBannerState = null,
  willBookOnCreate: willBookOnCreateProp = false,
  needsBooktimeAuth = false,
  booktimeFixedDates,
  slotsLoading = false,
  connectedPhone = null,
  bookableDaysHint = null,
  authGateSection,
  clubBookingFlowActive = false,
  booktimeCompanyId = null,
  booktimeConnected = false,
}: LocationTimeTabProps) {
  const { t } = useTranslation();
  const clubsForSport = useMemo(
    () =>
      game.sport
        ? filterClubsBySport(clubs, game.sport, game.clubId ?? undefined)
        : clubs,
    [clubs, game.sport, game.clubId],
  );
  const club = clubsForSport.find((c) => c.id === selectedClub) ?? clubs.find((c) => c.id === selectedClub);
  const { apiEnabled: liveApiEnabled } = useBooktimeLiveApiEnabled(
    selectedClub || undefined,
    supportsClubBookingFlow(entityType, 'edit') && clubHasBookingIntegration(club),
  );
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);

  const initialLinkedBookingRecords = useMemo(
    () => (game.linkedBookings ?? []).map(linkedBookingToRecord),
    [game.linkedBookings],
  );

  const createDateFromSelection = () => {
    const start = new Date(selectedDate);
    const [h, m] = selectedTime.split(':').map(Number);
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + duration * 60 * 60 * 1000);
    return { startTime: start.toISOString(), endTime: end.toISOString() };
  };

  const getDurationLabel = useCallback(
    (dur: number) => {
      if (dur === Math.floor(dur)) {
        return t('createGame.hours', { count: dur });
      }
      const hours = Math.floor(dur);
      const minutes = (dur % 1) * 60;
      return t('createGame.hoursMinutes', { hours, minutes });
    },
    [t],
  );

  const initialLinkedBookingIds = useMemo(
    () => game.linkedBookings?.map((b) => b.externalBookingId) ?? [],
    [game.linkedBookings],
  );

  const locationTimeState = useGameLocationTimeState({
    entityType,
    panelMode: 'edit',
    club,
    courts,
    liveApiEnabled,
    maxParticipants: game.maxParticipants,
    playersPerMatch: game.playersPerMatch ?? 4,
    selectedCourtIds,
    selectedDate,
    selectedTime,
    duration,
    hasBookedCourt,
    initialSelectedBookingIds: initialLinkedBookingIds,
    initialTimeOverride: game.timeOverride ?? false,
    game,
    createDateFromSelection,
  });

  const {
    locationTimeMode,
    willBookOnCreate,
    skipRealCourtBooking,
    setSkipRealCourtBooking,
    selectedBookingIds,
    setSelectedBookingIds,
    timeOverride,
    setTimeOverride,
    overrideStartTime,
    overrideEndTime,
    setOverrideTimes,
    bookingSelectionLimits,
    integratedCourtIds,
  } = locationTimeState;

  const handleScheduleSync = useCallback(
    (schedule: {
      selectedDate: Date;
      selectedTime: string;
      durationHours: number;
      courtIds: string[];
    }) => {
      onDateChange(schedule.selectedDate);
      onTimeChange(schedule.selectedTime);
      onDurationChange(schedule.durationHours);
      if (schedule.courtIds.length > 0) {
        onSelectCourtIds?.(schedule.courtIds);
      }
    },
    [onDateChange, onTimeChange, onDurationChange, onSelectCourtIds],
  );

  const resetBookingSelection = useCallback(() => {
    setTimeOverride(false);
  }, [setTimeOverride]);

  const {
    selectedBookingRecords,
    handleSelectedBookingIdsChange,
    handleDerivedTimeChange,
    effectiveDerivedSummary,
    linkedBookingsHydrating,
    fallbackSelectedBookings,
  } = useEditGameLocationTimeBookingSync({
    club,
    courts,
    bookingMatchCourts: courts,
    companyId: booktimeCompanyId,
    clubBookingFlowActive,
    initialLinkedBookingIds,
    locationTimeMode,
    selectedBookingIds,
    setSelectedBookingIds,
    initialSelectedBookingRecords: initialLinkedBookingRecords,
    timeOverride,
    setTimeOverride,
    overrideStartTime,
    overrideEndTime,
    onScheduleSync: handleScheduleSync,
    resetBookingSelection,
    selectedClubId: selectedClub,
    initialClubId: game.clubId ?? '',
  });

  const pendingUnlinkIds = useMemo(
    () =>
      computePendingBookingUnlinks(
        initialLinkedBookingIds,
        pendingRemoveBookingIds,
        selectedBookingIds,
        locationTimeMode === 'bookings',
      ),
    [initialLinkedBookingIds, pendingRemoveBookingIds, selectedBookingIds, locationTimeMode],
  );

  const draftPayload = useMemo(
    (): EditLocationTimeDraft => ({
      locationTimeMode,
      selectedBookingIds,
      selectedBookingRecords,
      timeOverride,
      overrideStartTime,
      overrideEndTime,
      willBookOnCreate,
      integratedCourtIds,
    }),
    [
      locationTimeMode,
      selectedBookingIds,
      selectedBookingRecords,
      timeOverride,
      overrideStartTime,
      overrideEndTime,
      willBookOnCreate,
      integratedCourtIds,
    ],
  );

  useEffect(() => {
    onDraftChange(draftPayload);
  }, [draftPayload, onDraftChange]);

  const reservationsActive =
    clubBookingFlowActive &&
    Boolean(booktimeCompanyId) &&
    booktimeConnected &&
    !needsBooktimeAuth;

  const courtSection = (
    <CreateGameCourtSection
      clubs={clubsForSport}
      courts={courts}
      selectedClub={selectedClub}
      selectedCourt={selectedCourt}
      selectedCourtIds={selectedCourtIds}
      maxParticipants={game.maxParticipants}
      multiSelectCourts={game.maxParticipants > 4}
      selectedDate={selectedDate}
      hasBookedCourt={hasBookedCourt}
      entityType={entityType}
      onSelectCourt={onSelectCourt}
      onToggleHasBookedCourt={onToggleHasBookedCourt}
      preferredSport={game.sport}
    />
  );

  const dateSection = (
    <CreateGameDateSection
      selectedDate={selectedDate}
      showDatePicker={showDatePicker}
      onDateSelect={onDateChange}
      onCalendarClick={() => onShowDatePickerChange(true)}
      onCloseDatePicker={() => onShowDatePickerChange(false)}
      generateTimeOptionsForDate={generateTimeOptionsForDate}
      dateFixedDates={booktimeFixedDates}
      hideCalendar={willBookOnCreateProp}
      bookableDaysHint={bookableDaysHint}
    />
  );

  return (
    <div className="space-y-4">
      {pendingUnlinkIds.length > 0 ? <PendingBookingUnlinkHint /> : null}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
          {t('createGame.club')}
        </label>
        <CreateGameClubSection
          clubs={clubsForSport}
          courts={courts}
          selectedClub={selectedClub}
          selectedCourt={selectedCourt}
          isClubModalOpen={isClubModalOpen}
          onSelectClub={(id) => onSelectClub?.(id)}
          onOpenClubModal={() => setIsClubModalOpen(true)}
          onCloseClubModal={() => setIsClubModalOpen(false)}
        />
      </div>
      <GameLocationTimePanel
        mode="edit"
        entityType={entityType}
        club={club}
        locationTimeMode={locationTimeMode}
        skipRealCourtBooking={skipRealCourtBooking}
        onSkipRealCourtBookingChange={setSkipRealCourtBooking}
        selectedCourtIds={selectedCourtIds}
        courts={courts}
        bookingMatchCourts={courts}
        selectedDate={selectedDate}
        selectedBookingIds={selectedBookingIds}
        fallbackSelectedBookings={fallbackSelectedBookings}
        onSelectedBookingIdsChange={
          reservationsActive ? handleSelectedBookingIdsChange : undefined
        }
        bookingSelectionLimits={reservationsActive ? bookingSelectionLimits : undefined}
        companyId={reservationsActive ? (booktimeCompanyId ?? undefined) : undefined}
        booktimeConnected={reservationsActive ? booktimeConnected : false}
        onDerivedTimeChange={reservationsActive ? handleDerivedTimeChange : undefined}
        timeOverride={timeOverride}
        onTimeOverrideChange={setTimeOverride}
        overrideStartTime={overrideStartTime}
        overrideEndTime={overrideEndTime}
        onOverrideTimesChange={setOverrideTimes}
        derivedSummary={
          locationTimeMode === 'bookings'
            ? {
                startTime: effectiveDerivedSummary.startTime,
                endTime: effectiveDerivedSummary.endTime,
                count: effectiveDerivedSummary.count,
              }
            : undefined
        }
        needsBooktimeAuth={needsBooktimeAuth}
        authGateSection={authGateSection}
        dateSection={dateSection}
        courtSection={courtSection}
        timeSlotsChildren={
          <GameStartSection
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            duration={duration}
            showDatePicker={showDatePicker}
            selectedClub={selectedClub}
            selectedCourt={selectedCourt}
            club={club}
            generateTimeOptions={generateTimeOptions}
            generateTimeOptionsForDate={generateTimeOptionsForDate}
            canAccommodateDuration={canAccommodateDuration}
            getAdjustedStartTime={getAdjustedStartTime}
            getTimeSlotsForDuration={getTimeSlotsForDuration}
            isSlotHighlighted={isSlotHighlighted}
            getDurationLabel={getDurationLabel}
            onDateSelect={onDateChange}
            onCalendarClick={() => onShowDatePickerChange(true)}
            onCloseDatePicker={() => onShowDatePickerChange(false)}
            onTimeSelect={onTimeChange}
            onDurationChange={onDurationChange}
            entityType={entityType}
            dateInputRef={dateInputRef}
            panelMode="edit"
            bookCourtEnabled={willBookOnCreateProp}
            hideOccupancyOverlay={willBookOnCreateProp}
            needsBooktimeAuth={needsBooktimeAuth}
            dateFixedDates={booktimeFixedDates}
            hideCalendar={willBookOnCreateProp}
            bookableDaysHint={bookableDaysHint}
            connectedPhone={connectedPhone}
            slotsLoading={slotsLoading || linkedBookingsHydrating}
            snapshotOverlayEnabled={snapshotOverlayEnabled}
            snapshotLoading={snapshotLoading}
            snapshotBannerState={snapshotBannerState}
            compact
            hideDateSection
          />
        }
      />
    </div>
  );
}
