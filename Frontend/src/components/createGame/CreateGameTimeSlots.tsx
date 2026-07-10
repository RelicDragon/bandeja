import { memo, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { EntityType, Club } from '@/types';
import { CourtDisplayName } from '@/components/CourtDisplayName';
import { SelectedTimeSummary } from '@/components/createGame/SelectedTimeSummary';
import { useReservationGridSync } from '@/components/gameLocationTime/useReservationGridSync';
import {
  mapBookingsToTimeGridCells,
} from '@shared/gameBooking/mapBookingsToTimeGridCells';
import {
  resolveOccupancyCellClasses,
  resolveSelectionCellClasses,
  SELECTION_TINT_OVERLAY_CLASS,
  shouldShowGameTimeSelectionCheck,
} from '@/components/createGame/timeSlotCellStyles';
import { MonthCalendarWeatherPill } from '@/components/MonthCalendarWeatherPill';
import { MonthCalendarWeatherToggle } from '@/components/MonthCalendarWeatherToggle';
import type { CalendarDayWeather } from '@/utils/calendarWeather.util';

interface BookedSlotInfo {
  courtName: string | null;
  integrationCourtName: string | null;
  startTime: string;
  endTime: string;
  hasBookedCourt: boolean;
  clubBooked: boolean;
}

interface CreateGameTimeSlotsProps {
  times: string[];
  selectedTime: string;
  duration: number;
  entityType: EntityType;
  club?: Club;
  hideOccupancyOverlay: boolean;
  slotsLoading: boolean;
  timezoneLabel?: string;
  isSlotBooked: (time: string) => boolean;
  areAllSlotsUnconfirmed: (time: string) => boolean;
  hasExternallyBookedSlot: (time: string) => boolean;
  isSlotHardBlocked: (time: string) => boolean;
  canAccommodateDuration: (time: string, duration: number) => boolean;
  getAdjustedStartTime: (clickedTime: string, duration: number) => string | null;
  isSlotHighlighted: (time: string) => boolean;
  onTimeSelect: (time: string) => void;
  bookedSlotInfo: BookedSlotInfo[] | null;
  getDurationLabel: (dur: number) => string;
  availabilityOverlay?: ReactNode;
  availabilityOverlayLoading?: boolean;
  weatherByTime?: Map<string, CalendarDayWeather>;
  weatherLocale?: string;
  weatherMode?: boolean;
  weatherToggleDisabled?: boolean;
  onWeatherModeToggle?: () => void;
}

function parseTime(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function groupBookedSlots(bookedSlotInfo: BookedSlotInfo[]) {
  const sorted = [...bookedSlotInfo].sort((a, b) => {
    const clubBookedCompare = (b.clubBooked ? 1 : 0) - (a.clubBooked ? 1 : 0);
    if (clubBookedCompare !== 0) return clubBookedCompare;
    const courtCompare = (a.courtName || '').localeCompare(b.courtName || '');
    if (courtCompare !== 0) return courtCompare;
    const confirmedCompare = (a.hasBookedCourt ? 1 : 0) - (b.hasBookedCourt ? 1 : 0);
    if (confirmedCompare !== 0) return confirmedCompare;
    return parseTime(a.startTime) - parseTime(b.startTime);
  });

  const grouped: BookedSlotInfo[] = [];

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
        grouped.push({ ...slot });
      }
    } else {
      grouped.push({ ...slot });
    }
  }

  return grouped;
}

export const CreateGameTimeSlots = memo(function CreateGameTimeSlots({
  times,
  selectedTime,
  duration,
  entityType,
  club,
  hideOccupancyOverlay,
  slotsLoading,
  timezoneLabel,
  isSlotBooked,
  areAllSlotsUnconfirmed,
  hasExternallyBookedSlot,
  isSlotHardBlocked,
  canAccommodateDuration,
  getAdjustedStartTime,
  isSlotHighlighted,
  onTimeSelect,
  bookedSlotInfo,
  getDurationLabel,
  availabilityOverlay,
  availabilityOverlayLoading = false,
  weatherByTime,
  weatherLocale,
  weatherMode = false,
  weatherToggleDisabled = false,
  onWeatherModeToggle,
}: CreateGameTimeSlotsProps) {
  const { t } = useTranslation();
  const reservationGrid = useReservationGridSync();

  const reservationCellMap = useMemo(() => {
    if (!reservationGrid?.enabled) return null;
    return mapBookingsToTimeGridCells({
      bookings: reservationGrid.dateBookings,
      gridTimes: times,
      timeZone: reservationGrid.clubTimezone,
      selectedBookingIds: reservationGrid.selectedBookingIds,
    });
  }, [reservationGrid, times]);

  const showReservationLegend = useMemo(() => {
    if (!reservationCellMap) return false;
    return Object.values(reservationCellMap).some((cell) => cell.hasReservation);
  }, [reservationCellMap]);

  const groupedBookedSlots = useMemo(
    () => (bookedSlotInfo && bookedSlotInfo.length > 0 ? groupBookedSlots(bookedSlotInfo) : []),
    [bookedSlotInfo],
  );
  const showWeatherPills = Boolean(
    weatherMode && weatherByTime && weatherLocale && weatherByTime.size > 0,
  );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
          {t('createGame.selectTime')}
          {timezoneLabel ? (
            <span className="ml-2 text-gray-500 dark:text-gray-500 font-normal">
              ({t('createGame.clubTime')} {timezoneLabel})
            </span>
          ) : null}
        </label>
        {onWeatherModeToggle ? (
          <MonthCalendarWeatherToggle
            active={weatherMode}
            disabled={weatherToggleDisabled}
            onClick={onWeatherModeToggle}
            compact
          />
        ) : null}
      </div>
      {showReservationLegend ? (
        <p className="text-[10px] leading-snug text-gray-500 dark:text-gray-400 mb-2">
          {t('createGame.locationTime.gridLegend')}
        </p>
      ) : null}
      <div className="relative min-h-[5.5rem]">
        <div
          className={
            availabilityOverlay && availabilityOverlayLoading
              ? 'opacity-40 pointer-events-none select-none'
              : undefined
          }
        >
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
            <div className={`grid grid-cols-6 gap-1.5 p-1 ${showWeatherPills ? 'pb-3' : ''}`}>
              {times.map((time) => {
                const isSelected = selectedTime === time;
                const isHighlighted = entityType !== 'BAR' ? isSlotHighlighted(time) : false;
                const canAccommodate = entityType !== 'BAR' ? canAccommodateDuration(time, duration) : true;
                const isBooked = !hideOccupancyOverlay && isSlotBooked(time);
                const allUnconfirmed = isBooked && areAllSlotsUnconfirmed(time);
                const isExternallyBooked = isBooked && hasExternallyBookedSlot(time);
                const isHardBlocked = isBooked && isSlotHardBlocked(time);
                const reservationCell = reservationCellMap?.[time] ?? null;
                const slotWeather = weatherByTime?.get(time) ?? null;

                const blockHardBookedSlot = hideOccupancyOverlay && isHardBlocked;
                const isInSelectedRange =
                  Boolean(selectedTime) &&
                  (entityType === 'BAR' ? isSelected : isHighlighted);
                const showGameTimeSelection = shouldShowGameTimeSelectionCheck({
                  isInSelectedRange,
                  reservationCell,
                });

                const handleTimeClick = () => {
                  if (entityType !== 'BAR' && blockHardBookedSlot) return;
                  if (reservationCell?.hasReservation && reservationGrid) {
                    if (reservationGrid.handleGridCellTap(reservationCell)) return;
                  }
                  if (
                    reservationGrid &&
                    reservationGrid.selectedBookingIds.length > 0 &&
                    !reservationCell?.hasReservation
                  ) {
                    reservationGrid.clearBookingSelection();
                  }
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
                    disabled={entityType !== 'BAR' && blockHardBookedSlot}
                    onClick={handleTimeClick}
                    className={`relative overflow-visible w-full h-10 flex items-center justify-center rounded-lg font-medium text-xs transition-all ${resolveOccupancyCellClasses(
                      {
                        isBooked,
                        allUnconfirmed,
                        isExternallyBooked,
                        reservationCell,
                      },
                    )} ${resolveSelectionCellClasses(showGameTimeSelection)}`}
                  >
                    {showGameTimeSelection ? (
                      <span className={SELECTION_TINT_OVERLAY_CLASS} aria-hidden />
                    ) : null}
                    {showGameTimeSelection ? (
                      <span
                        className="absolute top-0.5 right-0.5 z-[1] flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary-500 text-white shadow-sm dark:bg-primary-400 dark:text-gray-900"
                        aria-hidden
                      >
                        <Check size={9} strokeWidth={3} />
                      </span>
                    ) : null}
                    {reservationCell?.hasSelectedReservation ? (
                      <Check size={12} className="absolute top-1 right-1 z-[1] text-emerald-700 dark:text-emerald-200" />
                    ) : null}
                    {reservationCell?.isAmbiguous ? (
                      <span className="absolute top-0.5 left-0.5 z-[1] min-w-[14px] h-[14px] px-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-bold leading-[14px]">
                        {reservationCell.coveringBookingIds.length}
                      </span>
                    ) : null}
                    <span className="relative z-[1]">{time}</span>
                    {showWeatherPills && slotWeather ? (
                      <MonthCalendarWeatherPill
                        weather={slotWeather}
                        locale={weatherLocale!}
                        selected={showGameTimeSelection}
                        muted={isBooked || blockHardBookedSlot}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {availabilityOverlay ? (
          <div
            className={
              availabilityOverlayLoading
                ? 'absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/85 px-2 dark:bg-gray-900/85'
                : 'pointer-events-none absolute inset-x-0 top-0 z-10 px-1 pt-1'
            }
            aria-live="polite"
            aria-busy={availabilityOverlayLoading || undefined}
          >
            {availabilityOverlay}
          </div>
        ) : null}
      </div>
      {!slotsLoading ? (
        <SelectedTimeSummary
          selectedTime={selectedTime && times.includes(selectedTime) ? selectedTime : ''}
          duration={duration}
          durationLabel={entityType !== 'BAR' && duration ? getDurationLabel(duration) : undefined}
          entityType={entityType}
        />
      ) : null}
      {!hideOccupancyOverlay && groupedBookedSlots.length > 0 ? (
        (() => {
          const hasExternalBooking = selectedTime
            ? hasExternallyBookedSlot(selectedTime)
            : groupedBookedSlots.some((info) => info.clubBooked);
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
                {t('createGame.overlapSoftTitle')}
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
        })()
      ) : null}
    </div>
  );
});
