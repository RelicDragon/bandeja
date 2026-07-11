import { ArrowUp, Clock } from 'lucide-react';
import { LocationTimeStepHeader } from '@/components/gameLocationTime/LocationTimeStepHeader';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState, RefObject, type ReactNode } from 'react';
import { CreateGameClubSection } from '@/components/createGame/CreateGameClubSection';
import { CreateGameDateSection } from '@/components/createGame/CreateGameDateSection';
import { CreateGameDurationSelector } from '@/components/createGame/CreateGameDurationSelector';
import { CreateGameTimeSlots } from '@/components/createGame/CreateGameTimeSlots';
import { AnimatePresence, motion } from 'framer-motion';
import { EntityType, Club, Court, Sport } from '@/types';
import { getTimezoneOffsetString, isTimezoneDifferent } from '@/hooks/useGameTimeDuration';
import { useCourtOccupancy } from '@/hooks/useCourtOccupancy';
import { BooktimeAvailabilityBanner } from '@/components/booktime/BooktimeAvailabilityBanner';
import { useClubIntegrationDurations } from '@/hooks/useClubIntegrationDurations';
import { pickClosestDurationOption } from '@/integrations/booktime/durations';
import type { BooktimeSnapshotBanner } from '@/hooks/useBooktimeSnapshotRefresh';
import {
  effectiveCourtSportFilter,
  filterCourtsByClubSports,
  filterCourtsBySport,
} from '@/utils/courtSport';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { useTimeSlotWeather } from '@/hooks/useTimeSlotWeather';
import {
  readCalendarWeatherMode,
  writeCalendarWeatherMode,
} from '@/utils/calendarWeatherModeStorage';

interface GameStartSectionProps {
  selectedDate: Date;
  selectedTime: string;
  duration: number;
  showDatePicker: boolean;
  selectedClub: string;
  selectedCourt?: string | null;
  club?: Club;
  generateTimeOptions: () => string[];
  generateTimeOptionsForDate: (date: Date) => string[];
  canAccommodateDuration: (time: string, duration: number) => boolean;
  getAdjustedStartTime: (clickedTime: string, duration: number) => string | null;
  getTimeSlotsForDuration: (startTime: string, duration: number) => string[];
  isSlotHighlighted: (time: string) => boolean;
  getDurationLabel: (dur: number) => string;
  onDateSelect: (date: Date) => void;
  onCalendarClick: () => void;
  onCloseDatePicker: () => void;
  onTimeSelect: (time: string) => void;
  onDurationChange: (duration: number) => void;
  entityType: EntityType;
  dateInputRef: RefObject<HTMLInputElement | null>;
  compact?: boolean;
  courtSection?: ReactNode;
  reservationSection?: ReactNode;
  authGateSection?: ReactNode;
  needsBooktimeAuth?: boolean;
  bookCourtEnabled?: boolean;
  hideOccupancyOverlay?: boolean;
  dateFixedDates?: Date[];
  hideCalendar?: boolean;
  hideDateSection?: boolean;
  bookableDaysHint?: number | null;
  connectedPhone?: string | null;
  slotsLoading?: boolean;
  booktimeSlotsActive?: boolean;
  hideTimeSlotsPicker?: boolean;
  timeSchedulingExtra?: ReactNode;
  existingBookingBanner?: ReactNode;
  snapshotOverlayEnabled?: boolean;
  snapshotLoading?: boolean;
  snapshotBannerState?: BooktimeSnapshotBanner;
  panelMode?: 'create' | 'edit';
  clubs?: Club[];
  courts?: Court[];
  preferredSport?: Sport | null;
  isClubModalOpen?: boolean;
  onSelectClub?: (id: string) => void;
  onOpenClubModal?: () => void;
  onCloseClubModal?: () => void;
}

export const GameStartSection = ({
  selectedDate,
  selectedTime,
  duration,
  showDatePicker,
  selectedClub,
  selectedCourt,
  club,
  generateTimeOptions,
  generateTimeOptionsForDate,
  canAccommodateDuration,
  getAdjustedStartTime,
  isSlotHighlighted,
  getDurationLabel,
  onDateSelect,
  onCalendarClick,
  onCloseDatePicker,
  onTimeSelect,
  onDurationChange,
  entityType,
  dateInputRef,
  compact = false,
  courtSection,
  reservationSection,
  authGateSection,
  needsBooktimeAuth = false,
  bookCourtEnabled = false,
  hideOccupancyOverlay = false,
  dateFixedDates,
  hideCalendar = false,
  hideDateSection = false,
  bookableDaysHint,
  connectedPhone,
  slotsLoading = false,
  booktimeSlotsActive = false,
  hideTimeSlotsPicker = false,
  timeSchedulingExtra,
  existingBookingBanner,
  snapshotOverlayEnabled = false,
  snapshotLoading = false,
  snapshotBannerState = null,
  panelMode = 'create',
  clubs,
  courts,
  preferredSport,
  isClubModalOpen = false,
  onSelectClub,
  onOpenClubModal,
  onCloseClubModal,
}: GameStartSectionProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const { durationOptions } = useClubIntegrationDurations(club, entityType, {
    selectedCourtId: selectedCourt,
    courts,
  });

  useEffect(() => {
    if (entityType === 'BAR' || durationOptions.length === 0) return;
    const next = pickClosestDurationOption(duration, durationOptions);
    if (next !== duration) onDurationChange(next);
  }, [duration, durationOptions, entityType, onDurationChange]);

  const bookedCourtsEnabled = !hideOccupancyOverlay && !needsBooktimeAuth;

  const occupancyCourts = useMemo(() => {
    if (!courts?.length) return undefined;
    if (selectedCourt && selectedCourt !== 'notBooked') return undefined;
    const sportFilter = effectiveCourtSportFilter(club?.sports, preferredSport ?? undefined);
    const clubCourts = filterCourtsByClubSports(courts, club?.sports);
    return filterCourtsBySport(clubCourts, sportFilter);
  }, [courts, club?.sports, preferredSport, selectedCourt]);

  const { isSlotBooked, getBookedSlotInfo, getOverlappingBookings, areAllSlotsUnconfirmed, hasExternallyBookedSlot, isSlotHardBlocked, isLoadingExternalSlots, snapshotBanner: bookedCourtsBanner, refetch } = useCourtOccupancy({
    clubId: bookedCourtsEnabled ? selectedClub || null : null,
    selectedDate,
    selectedCourt: selectedCourt || null,
    club,
    occupancyCourts,
    snapshotRefreshEnabled: !bookCourtEnabled,
    enabled: bookedCourtsEnabled,
  });

  const showTimezone = club && isTimezoneDifferent(club);
  const timezoneString = showTimezone ? getTimezoneOffsetString(club) : '';

  const bookedSlotInfo = useMemo(() => {
    if (hideOccupancyOverlay || !selectedTime) return null;
    return entityType !== 'BAR' && duration
      ? getOverlappingBookings(selectedTime, duration)
      : getBookedSlotInfo(selectedTime);
  }, [selectedTime, duration, entityType, getOverlappingBookings, getBookedSlotInfo, hideOccupancyOverlay]);

  const timeOptions = useMemo(() => generateTimeOptions(), [generateTimeOptions]);
  const hasTimeSlots = timeOptions.length > 0;
  const weatherCityAvailable = Boolean(
    club?.cityId ?? user?.currentCity?.id ?? user?.currentCityId,
  );
  const [weatherMode, setWeatherMode] = useState(() => readCalendarWeatherMode('timeSlots'));
  const weatherToggleDisabled = !weatherCityAvailable;

  const handleWeatherModeToggle = useCallback(() => {
    if (weatherToggleDisabled) return;
    setWeatherMode((previous) => {
      const next = !previous;
      writeCalendarWeatherMode('timeSlots', next);
      return next;
    });
  }, [weatherToggleDisabled]);

  const { weatherByTime } = useTimeSlotWeather({
    club,
    selectedDate,
    times: timeOptions,
    enabled: entityType !== 'BAR' && !needsBooktimeAuth && weatherMode && weatherCityAvailable,
  });
  const courtRequiredForScheduling =
    bookCourtEnabled && (!selectedCourt || selectedCourt === 'notBooked');
  const showDurationPicker =
    !courtRequiredForScheduling &&
    entityType !== 'BAR' &&
    durationOptions.length > 0 &&
    (slotsLoading || hasTimeSlots || booktimeSlotsActive);
  const showTimePicker =
    !courtRequiredForScheduling && (slotsLoading || hasTimeSlots);

  useEffect(() => {
    if (slotsLoading || needsBooktimeAuth) return;
    if (!selectedTime) return;

    if (!hasTimeSlots) {
      onTimeSelect('');
      return;
    }

    const isValidSelection = booktimeSlotsActive
      ? canAccommodateDuration(selectedTime, duration)
      : timeOptions.includes(selectedTime);

    if (!isValidSelection) {
      onTimeSelect('');
    }
  }, [
    slotsLoading,
    needsBooktimeAuth,
    hasTimeSlots,
    selectedTime,
    onTimeSelect,
    timeOptions,
    booktimeSlotsActive,
    canAccommodateDuration,
    duration,
  ]);

  useEffect(() => {
    if (showDatePicker && dateInputRef.current) {
      setTimeout(() => {
        dateInputRef.current?.showPicker?.();
      }, 100);
    }
  }, [showDatePicker, dateInputRef]);

  useEffect(() => {
    if (!selectedClub || !bookedCourtsEnabled) return;

    const interval = setInterval(() => {
      refetch();
    }, 10000);

    return () => clearInterval(interval);
  }, [selectedClub, refetch, bookedCourtsEnabled]);

  const showClubPicker = clubs != null && courts != null && onSelectClub && onOpenClubModal && onCloseClubModal;

  const booktimeOccupancyOverlayEnabled =
    !snapshotOverlayEnabled &&
    !needsBooktimeAuth &&
    entityType !== 'BAR' &&
    !bookCourtEnabled &&
    club?.integrationType === 'BOOKTIME';

  const isAvailabilityWarning = (banner: BooktimeSnapshotBanner) =>
    banner === 'noSyncToday' || banner === 'scoutPoolEmpty';

  const availabilityOverlayLoading = snapshotOverlayEnabled
    ? snapshotLoading
    : booktimeOccupancyOverlayEnabled && isLoadingExternalSlots;

  const availabilityOverlayBanner = snapshotOverlayEnabled
    ? snapshotBannerState
    : bookedCourtsBanner;

  const availabilityOverlayVisible =
    !needsBooktimeAuth &&
    (snapshotOverlayEnabled
      ? availabilityOverlayLoading || isAvailabilityWarning(availabilityOverlayBanner)
      : booktimeOccupancyOverlayEnabled &&
        (availabilityOverlayLoading || isAvailabilityWarning(availabilityOverlayBanner)));

  const availabilityOverlay = availabilityOverlayVisible ? (
    <BooktimeAvailabilityBanner
      loading={availabilityOverlayLoading}
      banner={availabilityOverlayBanner}
      gameFlow={panelMode}
    />
  ) : null;

  const dateSection = hideDateSection ? null : (
    <CreateGameDateSection
      selectedDate={selectedDate}
      showDatePicker={showDatePicker}
      onDateSelect={onDateSelect}
      onCalendarClick={onCalendarClick}
      onCloseDatePicker={onCloseDatePicker}
      generateTimeOptionsForDate={generateTimeOptionsForDate}
      dateFixedDates={dateFixedDates}
      hideCalendar={hideCalendar}
      bookableDaysHint={bookableDaysHint}
    />
  );

  const selectedTimeTrailing = (() => {
    if (!selectedTime) return null;
    if (entityType === 'BAR' || !duration) return selectedTime;
    const [h, m] = selectedTime.split(':').map(Number);
    const endMinutes = h * 60 + m + Math.round(duration * 60);
    const endLabel = `${String(Math.floor(endMinutes / 60) % 24).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
    return `${selectedTime}–${endLabel}`;
  })();

  const timeSlotsSection = (
    <>
      <LocationTimeStepHeader
        icon={Clock}
        title={t('createGame.locationSteps.time')}
        done={Boolean(selectedTime)}
        trailing={selectedTimeTrailing}
      />
      {showDurationPicker ? (
        <CreateGameDurationSelector
          duration={duration}
          durationOptions={durationOptions}
          getDurationLabel={getDurationLabel}
          onDurationChange={onDurationChange}
          connectedPhone={connectedPhone}
        />
      ) : null}
      {courtRequiredForScheduling ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">
          <ArrowUp size={16} className="shrink-0" aria-hidden />
          <span className="text-center">{t('createGame.selectCourtFirst')}</span>
          <ArrowUp size={16} className="shrink-0" aria-hidden />
        </div>
      ) : null}
      {!courtRequiredForScheduling && !needsBooktimeAuth && !slotsLoading && !hasTimeSlots ? (
        hideTimeSlotsPicker ? null :
        <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">
          {t(
            booktimeSlotsActive
              ? 'createGame.noTimeSlotsForDuration'
              : 'createGame.noTimeSlotsForDate',
          )}
        </div>
      ) : null}
      {!courtRequiredForScheduling ? timeSchedulingExtra : null}
      {showTimePicker && !hideTimeSlotsPicker ? (
        <CreateGameTimeSlots
          times={timeOptions}
          selectedTime={selectedTime}
          duration={duration}
          entityType={entityType}
          club={club}
          hideOccupancyOverlay={hideOccupancyOverlay}
          slotsLoading={slotsLoading}
          timezoneLabel={showTimezone && timezoneString ? timezoneString : undefined}
          isSlotBooked={isSlotBooked}
          areAllSlotsUnconfirmed={areAllSlotsUnconfirmed}
          hasExternallyBookedSlot={hasExternallyBookedSlot}
          isSlotHardBlocked={isSlotHardBlocked}
          canAccommodateDuration={canAccommodateDuration}
          getAdjustedStartTime={getAdjustedStartTime}
          isSlotHighlighted={isSlotHighlighted}
          onTimeSelect={onTimeSelect}
          bookedSlotInfo={bookedSlotInfo}
          getDurationLabel={getDurationLabel}
          availabilityOverlay={availabilityOverlay}
          availabilityOverlayLoading={availabilityOverlayLoading}
          weatherByTime={weatherByTime}
          weatherLocale={displaySettings.locale}
          weatherMode={weatherMode}
          weatherToggleDisabled={weatherToggleDisabled}
          onWeatherModeToggle={handleWeatherModeToggle}
        />
      ) : null}
    </>
  );

  const clubPickerSection = showClubPicker ? (
    <CreateGameClubSection
      clubs={clubs}
      courts={courts}
      selectedClub={selectedClub}
      selectedCourt={selectedCourt ?? 'notBooked'}
      isClubModalOpen={isClubModalOpen}
      onSelectClub={onSelectClub}
      onOpenClubModal={onOpenClubModal}
      onCloseClubModal={onCloseClubModal}
    />
  ) : null;

  const afterClubScheduling = (
    <>
      {!needsBooktimeAuth ? courtSection : null}
      {!needsBooktimeAuth ? reservationSection : null}
      {!needsBooktimeAuth ? existingBookingBanner : null}
      <AnimatePresence>
        {needsBooktimeAuth ? (
          <motion.div
            key="auth-gate"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {authGateSection}
          </motion.div>
        ) : null}
      </AnimatePresence>
      {!needsBooktimeAuth ? (
        <motion.div
          key="time-scheduling"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          {timeSlotsSection}
        </motion.div>
      ) : null}
    </>
  );

  const content = (
    <div className="space-y-4">
      {clubPickerSection}
      {showClubPicker && !selectedClub ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">
          <ArrowUp size={16} className="shrink-0" aria-hidden />
          <span className="text-center">{t('createGame.selectClubFirst')}</span>
        </div>
      ) : (
        <>
          {dateSection}
          {afterClubScheduling}
        </>
      )}
    </div>
  );

  if (compact) {
    return content;
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      {content}
    </div>
  );
};
