import { Calendar as CalendarIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, RefObject, type ReactNode } from 'react';
import { addDays, format } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { DateSelector } from '@/components';
import { CalendarComponent } from '@/components/Calendar';
import { EntityType, Club } from '@/types';
import { getTimezoneOffsetString, isTimezoneDifferent } from '@/hooks/useGameTimeDuration';
import { useBookedCourts } from '@/hooks/useBookedCourts';
import { CourtDisplayName } from '@/components/CourtDisplayName';
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
}: GameStartSectionProps) => {
  const { t } = useTranslation();
  const { durationOptions } = useClubIntegrationDurations(club, entityType);

  useEffect(() => {
    if (entityType === 'BAR' || durationOptions.length === 0) return;
    const next = pickClosestDurationOption(duration, durationOptions);
    if (next !== duration) onDurationChange(next);
  }, [duration, durationOptions, entityType, onDurationChange]);

  const bookedCourtsEnabled = !hideOccupancyOverlay && !needsBooktimeAuth;

  const { isSlotBooked, getBookedSlotInfo, getOverlappingBookings, areAllSlotsUnconfirmed, hasExternallyBookedSlot, isSlotHardBlocked, isLoadingExternalSlots, snapshotBanner: bookedCourtsBanner, refetch } = useBookedCourts({
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

  const groupedBookedSlots = useMemo(() => {
    if (!bookedSlotInfo || bookedSlotInfo.length === 0) return [];

    const parseTime = (timeStr: string): number => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };

    const sorted = [...bookedSlotInfo].sort((a, b) => {
      const clubBookedCompare = (b.clubBooked ? 1 : 0) - (a.clubBooked ? 1 : 0);
      if (clubBookedCompare !== 0) return clubBookedCompare;
      const courtCompare = (a.courtName || '').localeCompare(b.courtName || '');
      if (courtCompare !== 0) return courtCompare;
      const confirmedCompare = (a.hasBookedCourt ? 1 : 0) - (b.hasBookedCourt ? 1 : 0);
      if (confirmedCompare !== 0) return confirmedCompare;
      return parseTime(a.startTime) - parseTime(b.startTime);
    });

    const grouped: Array<{
      courtName: string | null;
      integrationCourtName: string | null;
      startTime: string;
      endTime: string;
      hasBookedCourt: boolean;
      clubBooked: boolean;
    }> = [];

    for (const slot of sorted) {
      const lastGroup = grouped[grouped.length - 1];

      if (
        lastGroup &&
        lastGroup.courtName === slot.courtName &&
        lastGroup.integrationCourtName === slot.integrationCourtName &&
        lastGroup.hasBookedCourt === slot.hasBookedCourt &&
        lastGroup.clubBooked === slot.clubBooked
      ) {
        const lastStart = parseTime(lastGroup.startTime);
        const lastEnd = parseTime(lastGroup.endTime);
        const slotStart = parseTime(slot.startTime);
        const slotEnd = parseTime(slot.endTime);

        if (slotStart <= lastEnd) {
          if (slotStart < lastStart) {
            lastGroup.startTime = slot.startTime;
          }
          if (slotEnd > lastEnd) {
            lastGroup.endTime = slot.endTime;
          }
        } else {
          grouped.push({
            courtName: slot.courtName,
            integrationCourtName: slot.integrationCourtName,
            startTime: slot.startTime,
            endTime: slot.endTime,
            hasBookedCourt: slot.hasBookedCourt,
            clubBooked: slot.clubBooked,
          });
        }
      } else {
        grouped.push({
          courtName: slot.courtName,
          integrationCourtName: slot.integrationCourtName,
          startTime: slot.startTime,
          endTime: slot.endTime,
          hasBookedCourt: slot.hasBookedCourt,
          clubBooked: slot.clubBooked,
        });
      }
    }

    return grouped;
  }, [bookedSlotInfo]);

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

  const timeSchedulingSection = (
    <>
      {!needsBooktimeAuth && snapshotBanner}
      {!needsBooktimeAuth && entityType !== 'BAR' && !bookCourtEnabled && club?.integrationType === 'BOOKTIME' ? (
        <BooktimeAvailabilityBanner loading={isLoadingExternalSlots} banner={bookedCourtsBanner} />
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
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
          {t('createGame.selectTime')}
          {showTimezone && timezoneString && (
            <span className="ml-2 text-gray-500 dark:text-gray-500 font-normal">
              ({t('createGame.clubTime')} {timezoneString})
            </span>
          )}
        </label>
        {slotsLoading ? (
          <div className="grid grid-cols-6 gap-1.5 p-1">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="h-10 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-1.5 p-1">
            {generateTimeOptions().map((time) => {
              const isSelected = selectedTime === time;
              const isHighlighted = entityType !== 'BAR' ? isSlotHighlighted(time) : false;
              const canAccommodate = entityType !== 'BAR' ? canAccommodateDuration(time, duration) : true;
              const isBooked = !hideOccupancyOverlay && isSlotBooked(time);
              const allUnconfirmed = isBooked && areAllSlotsUnconfirmed(time);
              const isExternallyBooked = isBooked && hasExternallyBookedSlot(time);
              const isHardBlocked = isBooked && isSlotHardBlocked(time);

              const handleTimeClick = () => {
                if (entityType !== 'BAR' && isHardBlocked) return;
                if (entityType === 'BAR') {
                  onTimeSelect(time);
                } else if (canAccommodate) {
                  onTimeSelect(time);
                } else {
                  const adjustedStartTime = getAdjustedStartTime(time, duration);
                  if (adjustedStartTime) {
                    onTimeSelect(adjustedStartTime);
                  }
                }
              };

              return (
                <button
                  key={time}
                  type="button"
                  disabled={entityType !== 'BAR' && isHardBlocked}
                  onClick={handleTimeClick}
                  className={`w-full h-10 flex items-center justify-center rounded-lg font-medium text-xs transition-all ${
                    isSelected
                      ? 'bg-primary-500 text-white'
                      : isHighlighted
                        ? 'bg-primary-200 dark:bg-primary-800 text-primary-800 dark:text-primary-200 border border-primary-400 dark:border-primary-600'
                        : isBooked
                          ? isExternallyBooked
                            ? allUnconfirmed
                              ? 'bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-500 border border-red-200 dark:border-red-900/30'
                              : 'bg-red-200 dark:bg-red-900/30 text-red-800 dark:text-red-300 border border-red-400 dark:border-red-700'
                            : allUnconfirmed
                              ? 'bg-yellow-50 dark:bg-yellow-900/10 text-yellow-600 dark:text-yellow-500 border border-yellow-200 dark:border-yellow-900/30'
                              : 'bg-yellow-200 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border border-yellow-400 dark:border-yellow-700'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {time}
                </button>
              );
            })}
          </div>
        )}
        {!hideOccupancyOverlay && groupedBookedSlots && groupedBookedSlots.length > 0 && (() => {
          const hasExternalBooking = groupedBookedSlots.some((info) => info.clubBooked);
          const bgColor = hasExternalBooking
            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
          const textColor = hasExternalBooking
            ? 'text-red-900 dark:text-red-200'
            : 'text-yellow-900 dark:text-yellow-200';
          const itemTextColor = hasExternalBooking
            ? 'text-red-800 dark:text-red-300'
            : 'text-yellow-800 dark:text-yellow-300';

          return (
            <div className={`mt-2 px-3 py-2 ${bgColor} border rounded-lg`}>
              <p className={`text-xs font-medium ${textColor} mb-1`}>
                {(() => {
                  if (entityType !== 'BAR' && duration && selectedTime) {
                    const [startHour, startMinute] = selectedTime.split(':').map(Number);
                    const totalMinutes = duration * 60;
                    const endMinutes = startMinute + totalMinutes;
                    const endHour = startHour + Math.floor(endMinutes / 60);
                    const finalMinute = endMinutes % 60;
                    const endTime = `${endHour.toString().padStart(2, '0')}:${finalMinute.toString().padStart(2, '0')}`;
                    return `${t('createGame.timeSlot')} • ${selectedTime} - ${endTime}:`;
                  }
                  return `${t('createGame.timeSlot')} • ${selectedTime}:`;
                })()}
              </p>
              <div className="space-y-1">
                {groupedBookedSlots.map((info, idx) => (
                  <div key={idx} className={`text-xs ${itemTextColor} flex flex-wrap items-baseline gap-x-1 gap-y-0.5`}>
                    {info.clubBooked && club?.name ? <span>{club.name} •</span> : null}
                    <CourtDisplayName
                      name={info.courtName || t('createGame.bookedWithoutCourt')}
                      integrationName={info.integrationCourtName}
                      primaryClassName=""
                      secondaryClassName="text-[10px] opacity-75"
                      className="inline"
                    />
                    <span>
                      {`• ${info.startTime} - ${info.endTime}${!info.hasBookedCourt ? ` (${t('createGame.notConfirmed')})` : ''}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );

  const content = (
    <div className={compact ? 'space-y-4' : 'space-y-4'}>
      {!selectedClub ? (
        <div className="px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm text-center">
          {t('createGame.selectClubFirst')}
        </div>
      ) : (
        <>
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
                {timeSchedulingSection}
              </motion.div>
            )}
          </AnimatePresence>
        </>
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
