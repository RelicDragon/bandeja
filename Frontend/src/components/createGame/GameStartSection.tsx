import { Calendar as CalendarIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, RefObject, type ReactNode } from 'react';
import { CreateGameClubSection } from '@/components/createGame/CreateGameClubSection';
import { CreateGameTimeSlots } from '@/components/createGame/CreateGameTimeSlots';
import { addDays, format } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { DateSelector } from '@/components';
import { CalendarComponent } from '@/components/Calendar';
import { EntityType, Club, Court } from '@/types';
import { getTimezoneOffsetString, isTimezoneDifferent } from '@/hooks/useGameTimeDuration';
import { useCourtOccupancy } from '@/hooks/useCourtOccupancy';
import { BooktimeAvailabilityBanner } from '@/components/booktime/BooktimeAvailabilityBanner';
import { useClubIntegrationDurations } from '@/hooks/useClubIntegrationDurations';
import { pickClosestDurationOption } from '@/integrations/booktime/durations';

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
  bookableDaysHint?: number | null;
  connectedPhone?: string | null;
  slotsLoading?: boolean;
  existingBookingBanner?: ReactNode;
  snapshotBanner?: ReactNode;
  panelMode?: 'create' | 'edit';
  clubs?: Club[];
  courts?: Court[];
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
  bookableDaysHint,
  connectedPhone,
  slotsLoading = false,
  existingBookingBanner,
  snapshotBanner,
  panelMode = 'create',
  clubs,
  courts,
  isClubModalOpen = false,
  onSelectClub,
  onOpenClubModal,
  onCloseClubModal,
}: GameStartSectionProps) => {
  const { t } = useTranslation();
  const { durationOptions } = useClubIntegrationDurations(club, entityType);

  useEffect(() => {
    if (entityType === 'BAR' || durationOptions.length === 0) return;
    const next = pickClosestDurationOption(duration, durationOptions);
    if (next !== duration) onDurationChange(next);
  }, [duration, durationOptions, entityType, onDurationChange]);

  const bookedCourtsEnabled = !hideOccupancyOverlay && !needsBooktimeAuth;

  const { isSlotBooked, getBookedSlotInfo, getOverlappingBookings, areAllSlotsUnconfirmed, hasExternallyBookedSlot, isSlotHardBlocked, isLoadingExternalSlots, snapshotBanner: bookedCourtsBanner, refetch } = useCourtOccupancy({
    clubId: bookedCourtsEnabled ? selectedClub || null : null,
    selectedDate,
    selectedCourt: selectedCourt || null,
    club,
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

  const startDate = generateTimeOptionsForDate(new Date()).length === 0 ? addDays(new Date(), 1) : new Date();
  const defaultFixedDates = Array.from({ length: 8 }, (_, i) => addDays(startDate, i));
  const fixedDates = dateFixedDates ?? defaultFixedDates;
  const isSelectedDateInFixedRange = fixedDates.some(
    (date) => format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd'),
  );

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

  const schedulingBanners = (
    <>
      {!needsBooktimeAuth && snapshotBanner}
      {!snapshotBanner &&
      !needsBooktimeAuth &&
      entityType !== 'BAR' &&
      !bookCourtEnabled &&
      club?.integrationType === 'BOOKTIME' ? (
        <BooktimeAvailabilityBanner
          loading={isLoadingExternalSlots}
          banner={bookedCourtsBanner}
          gameFlow={panelMode}
        />
      ) : null}
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

  const dateSection = (
    <>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
          {t('createGame.selectDate')}
        </label>
        <DateSelector
          selectedDate={selectedDate}
          onDateSelect={onDateSelect}
          onCalendarClick={onCalendarClick}
          showCalendarAsSelected={!hideCalendar && (showDatePicker || !isSelectedDateInFixedRange)}
          hideTodayIfNoSlots={!dateFixedDates}
          hasTimeSlotsForToday={generateTimeOptionsForDate(new Date()).length > 0}
          hideCurrentDateIndicator={true}
          fixedDates={dateFixedDates}
          hideCalendar={hideCalendar}
        />
        {bookableDaysHint != null && bookableDaysHint > 0 ? (
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            {t('createGame.booktime.dateHint', { days: bookableDaysHint })}
          </p>
        ) : null}
      </div>
      {showDatePicker && !hideCalendar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCloseDatePicker} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 mx-4 max-w-md w-full border border-gray-200 dark:border-gray-800">
            <h3 className="section-title mb-4">{t('createGame.selectDate')}</h3>
            <CalendarComponent
              selectedDate={selectedDate}
              onDateSelect={(date: Date) => {
                onDateSelect(date);
                onCloseDatePicker();
              }}
              minDate={startDate}
            />
          </div>
        </div>
      )}
    </>
  );

  const timeSlotsSection = (
    <>
      {entityType !== 'BAR' && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              {t('createGame.duration')}
            </label>
            {connectedPhone ? (
              <span className="text-[10px] font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-950/40 px-2 py-0.5 rounded-full">
                {t('createGame.booktime.connectedChip', { phone: connectedPhone })}
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {durationOptions.map((dur) => (
              <button
                key={dur}
                type="button"
                onClick={() => onDurationChange(dur)}
                className={`h-10 rounded-lg font-semibold text-sm transition-all ${
                  duration === dur
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {getDurationLabel(dur)}
              </button>
            ))}
          </div>
        </div>
      )}
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
      />
    </>
  );

  const schedulingContent = (
    <>
      {schedulingBanners}
      {dateSection}
      {courtSection}
      {reservationSection}
      {existingBookingBanner}
      <AnimatePresence mode="wait">
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
        ) : (
          <motion.div
            key="time-scheduling"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {timeSlotsSection}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  const content = (
    <div className={compact ? 'space-y-4' : 'space-y-4'}>
      {showClubPicker ? (
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
      ) : null}
      {!selectedClub ? (
        <div className="px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm text-center">
          {t('createGame.selectClubFirst')}
        </div>
      ) : showClubPicker ? (
        <div className="space-y-4">{schedulingContent}</div>
      ) : (
        schedulingContent
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
