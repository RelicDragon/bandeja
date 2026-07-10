import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Club, Court, EntityType, Game } from '@/types';
import { GameLocationTimePanel } from '@/components/gameLocationTime/GameLocationTimePanel';
import { useClubDateReservations } from '@/components/gameLocationTime/useClubDateReservations';
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
import {
  resolveEditReservationActionOptions,
  resolveInitialEditReservationAction,
  type EditReservationAction,
} from '@shared/gameBooking/reservationIntent';
import { EditReservationActionPicker } from '@/components/gameLocationTime/ReservationIntentPicker';
import { EditReservationConsequenceSummary } from '@/components/gameLocationTime/ReservationSummaryCard';
import { LinkedBookingsList } from '@/components/gameLocationTime/LinkedBookingsList';
import { MultiCourtTimeHint } from '@/components/gameLocationTime/MultiCourtTimeHint';
import { filterClubsBySport } from '@/utils/courtSport';
import { formatGameDurationLabel } from '@/utils/formatGameDurationLabel';
import { computeRequiredCourtCount } from '@/utils/requiredCourtCount';
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
  booktimeSlotsActive?: boolean;
  connectedPhone?: string | null;
  bookableDaysHint?: number | null;
  authGateSection?: ReactNode;
  renderAuthGateSection?: (options: {
    collapsed: boolean;
    onSkip: () => void;
    onCollapsedClick: () => void;
  }) => ReactNode;
  clubBookingFlowActive?: boolean;
  booktimeCompanyId?: string | null;
  booktimeConnected?: boolean;
  panelRef?: RefObject<HTMLDivElement | null>;
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
  booktimeSlotsActive = false,
  connectedPhone = null,
  bookableDaysHint = null,
  authGateSection,
  renderAuthGateSection,
  clubBookingFlowActive = false,
  booktimeCompanyId = null,
  booktimeConnected = false,
  panelRef,
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
    (dur: number) => formatGameDurationLabel(dur, t),
    [t],
  );

  const initialLinkedBookingIds = useMemo(
    () => game.linkedBookings?.map((b) => b.externalBookingId) ?? [],
    [game.linkedBookings],
  );
  const [editReservationAction, setEditReservationAction] = useState<EditReservationAction>(() =>
    resolveInitialEditReservationAction({
      hasLinkedBookings: initialLinkedBookingIds.length > 0,
      clubBookingFlowActive,
      hasBookedCourt,
    }),
  );
  const prevGameIdRef = useRef(game.id);
  useEffect(() => {
    if (prevGameIdRef.current === game.id) return;
    prevGameIdRef.current = game.id;
    setEditReservationAction(
      resolveInitialEditReservationAction({
        hasLinkedBookings: initialLinkedBookingIds.length > 0,
        clubBookingFlowActive,
        hasBookedCourt,
      }),
    );
  }, [game.id, initialLinkedBookingIds.length, clubBookingFlowActive, hasBookedCourt]);
  const previousEditActionRef = useRef(editReservationAction);

  useEffect(() => {
    if (previousEditActionRef.current === editReservationAction) return;
    const previousAction = previousEditActionRef.current;
    previousEditActionRef.current = editReservationAction;
    if (editReservationAction === 'reserveNew' && previousAction !== 'reserveNew') {
      onSelectCourtIds?.([]);
      onTimeChange('');
    }
  }, [editReservationAction, onSelectCourtIds, onTimeChange]);

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
    editReservationAction,
    needsBooktimeAuth,
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
    () => {
      if (editReservationAction === 'unlink' || editReservationAction === 'gameOnly') {
        return initialLinkedBookingIds;
      }
      if (editReservationAction === 'keepCurrent' || editReservationAction === 'changeGameTimeOnly') {
        return [];
      }
      return computePendingBookingUnlinks(
        initialLinkedBookingIds,
        pendingRemoveBookingIds,
        selectedBookingIds,
        editReservationAction === 'useExisting' || initialLinkedBookingIds.length > 0,
      );
    },
    [
      editReservationAction,
      initialLinkedBookingIds,
      pendingRemoveBookingIds,
      selectedBookingIds,
    ],
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
      editReservationAction,
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
      editReservationAction,
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

  const showBooktimeAuthPrompt =
    clubBookingFlowActive &&
    Boolean(booktimeCompanyId) &&
    !booktimeConnected &&
    (editReservationAction === 'reserveNew' || editReservationAction === 'useExisting');
  const resolvedAuthGateSection = showBooktimeAuthPrompt
    ? renderAuthGateSection?.({
        collapsed: !needsBooktimeAuth,
        onSkip: () => setEditReservationAction('gameOnly'),
        onCollapsedClick: () => setSkipRealCourtBooking(false),
      }) ?? authGateSection
    : null;

  const courtSection = (
    <CreateGameCourtSection
      clubs={clubsForSport}
      courts={courts}
      selectedClub={selectedClub}
      selectedCourt={selectedCourt}
      selectedCourtIds={selectedCourtIds}
      maxParticipants={game.maxParticipants}
      playersPerMatch={game.playersPerMatch ?? 4}
      multiSelectCourts={bookingSelectionLimits.min > 1}
      selectedDate={selectedDate}
      hasBookedCourt={hasBookedCourt}
      entityType={entityType}
      onSelectCourt={onSelectCourt}
      onToggleHasBookedCourt={onToggleHasBookedCourt}
      preferredSport={game.sport}
      showHasBookedSwitch={false}
      showNotBookedOption={editReservationAction !== 'reserveNew'}
    />
  );

  const clubDateReservations = useClubDateReservations({
    club,
    companyId: booktimeCompanyId ?? '',
    selectedDate,
    enabled: reservationsActive,
    matchCourts: courts,
  });

  const hasReservationsForDate =
    clubDateReservations.bookingsLoaded && clubDateReservations.dateBookings.length > 0;

  const editActionOptions = useMemo(
    () =>
      resolveEditReservationActionOptions({
        hasLinkedBookings: initialLinkedBookingIds.length > 0,
        clubBookingFlowActive,
        hasBooktimeAuthPath: Boolean(booktimeCompanyId),
        hasReservationsForDate,
      }),
    [initialLinkedBookingIds.length, clubBookingFlowActive, booktimeCompanyId, hasReservationsForDate],
  );

  useEffect(() => {
    const availableIds = new Set(editActionOptions.map((option) => option.id));
    if (availableIds.has(editReservationAction)) return;
    setEditReservationAction(
      resolveInitialEditReservationAction({
        hasLinkedBookings: initialLinkedBookingIds.length > 0,
        clubBookingFlowActive,
        hasBookedCourt,
      }),
    );
  }, [
    editReservationAction,
    editActionOptions,
    initialLinkedBookingIds.length,
    clubBookingFlowActive,
    hasBookedCourt,
  ]);

  useEffect(() => {
    if (editReservationAction !== 'useExisting') return;
    if (hasReservationsForDate) return;
    if (!clubDateReservations.bookingsLoaded) return;
    setEditReservationAction(
      resolveInitialEditReservationAction({
        hasLinkedBookings: initialLinkedBookingIds.length > 0,
        clubBookingFlowActive,
        hasBookedCourt,
      }),
    );
  }, [
    editReservationAction,
    hasReservationsForDate,
    clubDateReservations.bookingsLoaded,
    initialLinkedBookingIds.length,
    clubBookingFlowActive,
    hasBookedCourt,
  ]);

  const actionPickerSection = (
    <EditReservationActionPicker
      value={editReservationAction}
      options={editActionOptions}
      onChange={setEditReservationAction}
    />
  );

  const showReserveNewScheduling =
    editReservationAction === 'reserveNew' && !needsBooktimeAuth;
  const showScheduleControls =
    editReservationAction === 'changeGameTimeOnly' ||
    editReservationAction === 'unlink' ||
    editReservationAction === 'gameOnly' ||
    showReserveNewScheduling;
  const showManualCourtControls =
    editReservationAction === 'changeGameTimeOnly' ||
    editReservationAction === 'unlink' ||
    editReservationAction === 'gameOnly' ||
    showReserveNewScheduling;

  const showReservationPicker = editReservationAction === 'useExisting';

  const requiredReservationCount = useMemo(
    () => computeRequiredCourtCount(game.maxParticipants, game.playersPerMatch ?? 4),
    [game.maxParticipants, game.playersPerMatch],
  );

  const multiCourtTimeHint = (
    <MultiCourtTimeHint
      requiredCourtCount={requiredReservationCount}
      integratedCourtCount={integratedCourtIds.length}
      hasTimeSlots={
        editReservationAction === 'reserveNew' && !needsBooktimeAuth
          ? generateTimeOptions().length > 0
          : false
      }
      booktimeSlotsActive={editReservationAction === 'reserveNew' && willBookOnCreateProp}
    />
  );

  const linkedReservationsSection =
    editReservationAction === 'keepCurrent' ? (
      <LinkedBookingsList
        game={game}
        club={club}
        courts={courts}
        readOnly
        readOnlyLabel
      />
    ) : null;

  const consequenceSection =
    editReservationAction === 'reserveNew' && needsBooktimeAuth ? null : (
      <EditReservationConsequenceSummary
        action={editReservationAction}
        linkedCount={initialLinkedBookingIds.length}
        selectedBookingCount={selectedBookingIds.length}
        willReserveNew={
          editReservationAction === 'reserveNew' &&
          willBookOnCreate &&
          Boolean(selectedTime)
        }
        pendingUnlinkCount={pendingUnlinkIds.length}
        club={club}
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
    <div
      ref={panelRef}
      data-testid="edit-location-time-panel"
      className="space-y-4"
    >
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
        intentSection={actionPickerSection}
        consequenceSection={consequenceSection}
        showDateSection={showReserveNewScheduling || editReservationAction !== 'reserveNew'}
        showCourtSection={showManualCourtControls}
        showTimeSlots={showScheduleControls}
        showReservations={showReservationPicker}
        showRealBookingHint={false}
        linkedReservationsSection={linkedReservationsSection}
        onEmptyReserveNow={() => setEditReservationAction('reserveNew')}
        onEmptyGameOnly={() => setEditReservationAction('gameOnly')}
        authGateSection={resolvedAuthGateSection}
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
            courts={courts}
            preferredSport={game.sport}
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
            slotsLoading={
              slotsLoading ||
              (locationTimeMode === 'bookings' && linkedBookingsHydrating)
            }
            booktimeSlotsActive={booktimeSlotsActive}
            snapshotOverlayEnabled={snapshotOverlayEnabled}
            snapshotLoading={snapshotLoading}
            snapshotBannerState={snapshotBannerState}
            compact
            hideDateSection
            timeSchedulingExtra={multiCourtTimeHint}
          />
        }
      />
    </div>
  );
}
