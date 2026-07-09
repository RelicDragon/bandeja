import { Calendar as CalendarIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, RefObject, type ReactNode } from 'react';
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
  const showDurationPicker =
    entityType !== 'BAR' &&
    durationOptions.length > 0 &&
    (slotsLoading || hasTimeSlots || booktimeSlotsActive);
  const showTimePicker = slotsLoading || hasTimeSlots;

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

  const schedulingBanners = (
    <>
      {entityType !== 'BAR' && (club?.policyText || club?.cancellationNoticeHours) && !needsBooktimeAuth ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
          {club.cancellationNoticeHours != null && club.cancellationNoticeHours > 0 && (
            <p className="mb-1">
              {t('createGame.clubCancellationNotice', { hours: club.cancellationNoticeHours })}
            </p>
          )}
          {club.policyText?.trim() && (
            <>
              <p className="font-medium text-gray-800 dark:text-gray-200">
                {t('createGame.clubPolicyTitle')}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{club.policyText.trim()}</p>
            </>
          )}
        </div>
      ) : null}
    </>
  );

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

  const timeSlotsSection = (
    <>
      {showDurationPicker ? (
        <CreateGameDurationSelector
          duration={duration}
          durationOptions={durationOptions}
          getDurationLabel={getDurationLabel}
          onDurationChange={onDurationChange}
          connectedPhone={connectedPhone}
        />
      ) : null}
      {!needsBooktimeAuth && !slotsLoading && !hasTimeSlots ? (
        hideTimeSlotsPicker ? null :
        <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">
          {t(
            booktimeSlotsActive
              ? 'createGame.noTimeSlotsForDuration'
              : 'createGame.noTimeSlotsForDate',
          )}
        </div>
      ) : null}
      {timeSchedulingExtra}
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
      {schedulingBanners}
      {courtSection}
      {reservationSection}
      {existingBookingBanner}
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
      <motion.div
        key="time-scheduling"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="space-y-4"
      >
        {timeSlotsSection}
      </motion.div>
    </>
  );

  const content = (
    <div className={compact ? 'space-y-4' : 'space-y-4'}>
      {dateSection}
      {clubPickerSection}
      {showClubPicker && !selectedClub ? (
        <div className="px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm text-center">
          {t('createGame.selectClubFirst')}
        </div>
      ) : (
        afterClubScheduling
      )}
    </div>
  );

  if (compact) {
    return content;
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <CalendarIcon size={18} className="text-gray-500 dark:text-gray-400" />
        <h2 className="section-title">
          {entityType === 'TOURNAMENT'
            ? t('createGame.gameStartTournament')
            : entityType === 'LEAGUE'
              ? t('createGame.gameStartLeague')
              : entityType === 'TRAINING'
                ? t('createGame.gameStartTraining')
                : t('createGame.gameStart')}
        </h2>
      </div>
      {content}
    </div>
  );
};
