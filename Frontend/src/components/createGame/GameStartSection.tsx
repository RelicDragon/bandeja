import { Calendar as CalendarIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, RefObject } from 'react';
import { addDays, format } from 'date-fns';
import { DateSelector, ToggleSwitch } from '@/components';
import { CalendarComponent } from '@/components/Calendar';
import { EntityType, Club } from '@/types';
import { getTimezoneOffsetString, isTimezoneDifferent } from '@/hooks/useGameTimeDuration';
import { useBookedCourts } from '@/hooks/useBookedCourts';

interface GameStartSectionProps {
  selectedDate: Date;
  selectedTime: string;
  duration: number;
  showPastTimes: boolean;
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
  onToggleShowPastTimes: (checked: boolean) => void;
  onCloseDatePicker: () => void;
  onTimeSelect: (time: string) => void;
  onDurationChange: (duration: number) => void;
  entityType: EntityType;
  dateInputRef: RefObject<HTMLInputElement | null>;
  compact?: boolean;
}

export const GameStartSection = ({
  selectedDate,
  selectedTime,
  duration,
  showPastTimes,
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
  onToggleShowPastTimes,
  onCloseDatePicker,
  onTimeSelect,
  onDurationChange,
  entityType,
  dateInputRef,
  compact = false,
}: GameStartSectionProps) => {
  const { t } = useTranslation();
  
  const { isSlotBooked, getBookedSlotInfo, getOverlappingBookings, areAllSlotsUnconfirmed, hasExternallyBookedSlot, refetch } = useBookedCourts({
    clubId: selectedClub || null,
    selectedDate,
    selectedCourt: selectedCourt || null,
    club,
  });
  
  const showTimezone = club && isTimezoneDifferent(club);
  const timezoneString = showTimezone ? getTimezoneOffsetString(club) : '';
  
  const bookedSlotInfo = useMemo(() => {
    if (!selectedTime) return null;
    return entityType !== 'BAR' && duration 
      ? getOverlappingBookings(selectedTime, duration)
      : getBookedSlotInfo(selectedTime);
  }, [selectedTime, duration, entityType, getOverlappingBookings, getBookedSlotInfo]);

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
            startTime: slot.startTime,
            endTime: slot.endTime,
            hasBookedCourt: slot.hasBookedCourt,
            clubBooked: slot.clubBooked,
          });
        }
      } else {
        grouped.push({
          courtName: slot.courtName,
          startTime: slot.startTime,
          endTime: slot.endTime,
          hasBookedCourt: slot.hasBookedCourt,
          clubBooked: slot.clubBooked,
        });
      }
    }

    return grouped;
  }, [bookedSlotInfo]);

  // Check if selected date is within the fixed date range (same logic as DateSelector)
  const startDate = !showPastTimes && generateTimeOptionsForDate(new Date()).length === 0 ? addDays(new Date(), 1) : new Date();
  const fixedDates = Array.from({ length: 8 }, (_, i) => addDays(startDate, i));
  const isSelectedDateInFixedRange = fixedDates.some(date =>
    format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd')
  );

  useEffect(() => {
    if (showDatePicker && dateInputRef.current) {
      setTimeout(() => {
        dateInputRef.current?.showPicker?.();
      }, 100);
    }
  }, [showDatePicker, dateInputRef]);

  useEffect(() => {
    if (!selectedClub) return;

    const interval = setInterval(() => {
      refetch();
    }, 10000);

    return () => clearInterval(interval);
  }, [selectedClub, refetch]);

  const content = (
    <div className={compact ? "space-y-4" : "space-y-4"}>
        {!selectedClub ? (
          <div className="px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm text-center">
            {t('createGame.selectClubFirst')}
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                {t('createGame.selectDate')}
              </label>
              <DateSelector
                selectedDate={selectedDate}
                onDateSelect={onDateSelect}
                onCalendarClick={onCalendarClick}
                showCalendarAsSelected={showDatePicker || !isSelectedDateInFixedRange}
                hideTodayIfNoSlots={!showPastTimes}
                hasTimeSlotsForToday={generateTimeOptionsForDate(new Date()).length > 0}
                hideCurrentDateIndicator={true}
              />
            </div>
            {showDatePicker && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCloseDatePicker} />
                <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 mx-4 max-w-md w-full border border-gray-200 dark:border-gray-800">
                  <h3 className="section-title mb-4">
                    {t('createGame.selectDate')}
                  </h3>
                  <CalendarComponent
                    selectedDate={selectedDate}
                    onDateSelect={(date: Date) => {
                      onDateSelect(date);
                      onCloseDatePicker();
                    }}
                    minDate={showPastTimes ? undefined : startDate}
                  />
                </div>
              </div>
            )}
            {entityType !== 'BAR' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                  {t('createGame.duration')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 1.5, 2].map((dur) => (
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
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
                {t('createGame.showPastTimes')}
              </span>
              <div className="flex-shrink-0">
                <ToggleSwitch checked={showPastTimes} onChange={onToggleShowPastTimes} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                {t('createGame.selectTime')}
                {showTimezone && timezoneString && (
                  <span className="ml-2 text-gray-500 dark:text-gray-500 font-normal">
                    ({t('createGame.clubTime')} {timezoneString})
                  </span>
                )}
              </label>
              <div className="grid grid-cols-6 gap-1.5 p-1">
                {generateTimeOptions().map((time) => {
                  const isSelected = selectedTime === time;
                  const isHighlighted = entityType !== 'BAR' ? isSlotHighlighted(time) : false;
                  const canAccommodate = entityType !== 'BAR' ? canAccommodateDuration(time, duration) : true;
                  const isBooked = isSlotBooked(time);
                  const allUnconfirmed = isBooked && areAllSlotsUnconfirmed(time);
                  const isExternallyBooked = isBooked && hasExternallyBookedSlot(time);
                  
                  const handleTimeClick = () => {
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
              {groupedBookedSlots && groupedBookedSlots.length > 0 && (() => {
                const hasExternalBooking = groupedBookedSlots.some(info => info.clubBooked);
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
                      {groupedBookedSlots.map((info, idx) => {
                        const courtDisplay = info.clubBooked && club?.name
                          ? `${club.name} • ${info.courtName || t('createGame.bookedWithoutCourt')}`
                          : info.courtName || t('createGame.bookedWithoutCourt');
                        return (
                          <p key={idx} className={`text-xs ${itemTextColor}`}>
                            {`${courtDisplay} • ${info.startTime} - ${info.endTime}${!info.hasBookedCourt ? ` (${t('createGame.notConfirmed')})` : ''}`}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
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
          {entityType === 'TOURNAMENT' ? t('createGame.gameStartTournament') :
           entityType === 'LEAGUE' ? t('createGame.gameStartLeague') :
           entityType === 'TRAINING' ? t('createGame.gameStartTraining') :
           t('createGame.gameStart')}
        </h2>
      </div>
      {content}
    </div>
  );
};


