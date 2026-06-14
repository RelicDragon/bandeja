import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Club, Court, EntityType, Game } from '@/types';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { GameLocationTimePanel } from '@/components/gameLocationTime/GameLocationTimePanel';
import { useGameLocationTimeState } from '@/components/gameLocationTime/useGameLocationTimeState';
import type { EditLocationTimeDraft } from '@/components/gameLocationTime/locationTimeDraft';
import {
  areBookingRecordsEqual,
  areStringArraysEqual,
  buildSelectedBookingRecordsSyncKey,
} from '@/components/gameLocationTime/locationTimeDraft';
import { linkedBookingToRecord } from '@/components/booktime/booktimeBookingUtils';
import { GameStartSection } from '@/components/createGame/GameStartSection';
import { CreateGameClubSection } from '@/components/createGame/CreateGameClubSection';
import { CreateGameCourtSection } from '@/components/createGame/CreateGameCourtSection';
import { CreateGameDateSection } from '@/components/createGame/CreateGameDateSection';
import { useBooktimeLiveApiEnabled } from '@/hooks/useBooktimeLiveApiEnabled';
import { supportsClubBookingFlow } from '@shared/gameBooking/supportsClubBookingFlow';
import { clubHasBookingIntegration, getBooktimeCompanyId } from '@shared/clubIntegration';
import { computePendingBookingUnlinks } from '@/components/gameLocationTime/computePendingBookingUnlinks';
import { PendingBookingUnlinkHint } from '@/components/gameLocationTime/PendingBookingUnlinkHint';
import type { RefObject, ReactNode } from 'react';

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
  onUnlinkBooking: (externalBookingId: string) => void;
  pendingRemoveBookingIds: string[];
  onDraftChange: (draft: EditLocationTimeDraft) => void;
  snapshotBanner?: ReactNode;
  willBookOnCreate?: boolean;
  needsBooktimeAuth?: boolean;
  booktimeFixedDates?: Date[];
  slotsLoading?: boolean;
  connectedPhone?: string | null;
  bookableDaysHint?: number | null;
  authGateSection?: ReactNode;
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
  onUnlinkBooking,
  pendingRemoveBookingIds,
  onDraftChange,
  snapshotBanner,
  willBookOnCreate: willBookOnCreateProp = false,
  needsBooktimeAuth = false,
  booktimeFixedDates,
  slotsLoading = false,
  connectedPhone = null,
  bookableDaysHint = null,
  authGateSection,
}: LocationTimeTabProps) {
  const { t } = useTranslation();
  const club = clubs.find((c) => c.id === selectedClub);
  const { apiEnabled: liveApiEnabled } = useBooktimeLiveApiEnabled(
    selectedClub || undefined,
    supportsClubBookingFlow(entityType, 'edit') && clubHasBookingIntegration(club),
  );
  const [selectedBookingRecords, setSelectedBookingRecords] = useState<BooktimeBookingRecord[]>(() =>
    (game.linkedBookings ?? []).map(linkedBookingToRecord),
  );
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);

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
    setLocationTimeMode,
    showSegmentedSwitch,
    showBookingsOnly,
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
    dirtyFlags,
    integratedCourtIds,
  } = locationTimeState;

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

  const handleUnlinkBooking = useCallback(
    (externalBookingId: string) => {
      setSelectedBookingIds((prev) => prev.filter((id) => id !== externalBookingId));
      onUnlinkBooking(externalBookingId);
    },
    [setSelectedBookingIds, onUnlinkBooking],
  );

  const handleSelectedBookingIdsChange = useCallback(
    (ids: string[], records?: BooktimeBookingRecord[]) => {
      setSelectedBookingIds((prev) => (areStringArraysEqual(prev, ids) ? prev : ids));
      if (records) {
        setSelectedBookingRecords((prev) => (areBookingRecordsEqual(prev, records) ? prev : records));
      }
    },
    [],
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

  const linkedGame: Game = {
    ...game,
    linkedBookings: (game.linkedBookings ?? []).filter(
      (b) => !pendingRemoveBookingIds.includes(b.externalBookingId),
    ),
  };

  const courtSection = (
    <CreateGameCourtSection
      clubs={clubs}
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
          clubs={clubs}
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
      game={linkedGame}
      locationTimeMode={locationTimeMode}
      onLocationTimeModeChange={setLocationTimeMode}
      showSegmentedSwitch={showSegmentedSwitch}
      showBookingsOnly={showBookingsOnly}
      skipRealCourtBooking={skipRealCourtBooking}
      onSkipRealCourtBookingChange={setSkipRealCourtBooking}
      selectedCourtIds={selectedCourtIds}
      courts={courts}
      selectedBookingIds={selectedBookingIds}
      onSelectedBookingIdsChange={handleSelectedBookingIdsChange}
      bookingSelectionLimits={bookingSelectionLimits}
      timeOverride={timeOverride}
      onTimeOverrideChange={setTimeOverride}
      overrideStartTime={overrideStartTime}
      overrideEndTime={overrideEndTime}
      onOverrideTimesChange={setOverrideTimes}
      dirtyFlags={dirtyFlags}
      companyId={getBooktimeCompanyId(club) ?? undefined}
      bookingsPanelEnabled
      needsBooktimeAuth={needsBooktimeAuth}
      authGateSection={authGateSection}
      onUnlinkBooking={handleUnlinkBooking}
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
          slotsLoading={slotsLoading}
          snapshotBanner={snapshotBanner}
          compact
          hideDateSection
        />
      }
    />
    </div>
  );
}
