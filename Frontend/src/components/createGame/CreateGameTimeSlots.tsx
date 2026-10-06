import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
  /** Admin hold — a hard block like a club booking. */
  holdBlocked?: boolean;
}

/**
 * Occupancy verdict for a start time, computed by the caller for the whole
 * game window and every court it needs. `hard`: cannot be picked (tapping
 * shows `reason`); `soft`: can be picked, `reason` is shown as a quiet note.
 */
export type TimeSlotBlock = {
  kind: 'hard' | 'soft';
  reason: string;
  /** Hard blocks the organizer can lift (e.g. "It's my booking", "Game only"); picking one also selects the time. */
  actions?: ReadonlyArray<{ id: string; label: string; onSelect: () => void }>;
};

type BlockedTap = { time: string; reason: string; actions?: TimeSlotBlock['actions'] };

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
  /** When set, replaces the built-in occupancy overlay (`isSlotBooked` & co. are ignored). */
  slotBlock?: (time: string) => TimeSlotBlock | null;
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
  slotBlock,
}: CreateGameTimeSlotsProps) {
  const { t } = useTranslation();
  const reservationGrid = useReservationGridSync();
  const [blockedTap, setBlockedTap] = useState<BlockedTap | null>(null);
  const blockedTapKey = blockedTap ? `${blockedTap.time}|${blockedTap.reason}` : null;
  const blockedTapHasActions = Boolean(blockedTap?.actions?.length);
  useEffect(() => {
    if (!blockedTapKey) return;
    // A way out stays up long enough to read and tap.
    const timer = window.setTimeout(() => setBlockedTap(null), blockedTapHasActions ? 12000 : 4000);
    return () => window.clearTimeout(timer);
  }, [blockedTapKey, blockedTapHasActions]);
  const selectedSoftNote =
    slotBlock && selectedTime ? slotBlock(selectedTime) : null;

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
      {timezoneLabel || onWeatherModeToggle ? (
        <div className="mb-2 flex items-center justify-between gap-2 min-h-[1.5rem]">
          {timezoneLabel ? (
            <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400">
              {t('createGame.clubTime')} {timezoneLabel}
            </span>
          ) : (
            <span />
          )}
          {onWeatherModeToggle ? (
            <MonthCalendarWeatherToggle
              active={weatherMode}
              disabled={weatherToggleDisabled}
              onClick={onWeatherModeToggle}
              compact
            />
          ) : null}
        </div>
      ) : null}
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
                const block = slotBlock ? slotBlock(time) : null;
                const isPlanBlocked = block?.kind === 'hard';
                const isBooked = !slotBlock && !hideOccupancyOverlay && isSlotBooked(time);
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
                  if (block?.kind === 'hard') {
                    setBlockedTap({ time, reason: block.reason, actions: block.actions });
                    return;
                  }
                  setBlockedTap(null);
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
                    const adjustedBlock = adjustedStartTime && slotBlock ? slotBlock(adjustedStartTime) : null;
                    if (adjustedBlock?.kind === 'hard') {
                      setBlockedTap({ time: adjustedStartTime ?? time, reason: adjustedBlock.reason, actions: adjustedBlock.actions });
                    } else if (adjustedStartTime) {
                      onTimeSelect(adjustedStartTime);
                    }
                  }
                };

                return (
                  <button
                    key={time}
                    type="button"
                    disabled={entityType !== 'BAR' && blockHardBookedSlot}
                    aria-disabled={isPlanBlocked || undefined}
                    title={block?.reason}
                    onClick={handleTimeClick}
                    className={`relative overflow-visible w-full h-10 flex items-center justify-center rounded-lg font-medium text-xs transition-all ${
                      isPlanBlocked && !showGameTimeSelection
                        ? 'bg-gray-50 dark:bg-gray-900 text-gray-300 dark:text-gray-600 border border-dashed border-gray-200 dark:border-gray-700 line-through'
                        : resolveOccupancyCellClasses({
                            isBooked,
                            allUnconfirmed,
                            isExternallyBooked,
                            reservationCell,
                          })
                    } ${resolveSelectionCellClasses(showGameTimeSelection)}`}
                  >
                    {block?.kind === 'soft' ? (
                      <span
                        className="absolute top-1 left-1 z-[1] h-1.5 w-1.5 rounded-full bg-amber-400 dark:bg-amber-500"
                        aria-hidden
                      />
                    ) : null}
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
      {slotBlock ? (
        <AnimatePresence initial={false} mode="popLayout">
          {blockedTap ? (
            <motion.div
              key={`blocked-${blockedTap.time}`}
              role="status"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="mt-2 rounded-xl bg-gray-100 px-3 py-2 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-200"
              data-testid="time-slot-blocked"
            >
              <p>{t('createGame.courtPlan.time.unavailableAt', { time: blockedTap.time, reason: blockedTap.reason })}</p>
              {blockedTap.actions?.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {blockedTap.actions.map((action, index) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => {
                        const time = blockedTap.time;
                        setBlockedTap(null);
                        action.onSelect();
                        onTimeSelect(time);
                      }}
                      className={`min-h-[40px] rounded-full px-4 text-sm font-semibold transition-transform active:scale-[0.97] ${
                        index === 0
                          ? 'bg-primary-600 text-white hover:bg-primary-700'
                          : 'border border-gray-300 bg-white text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100'
                      }`}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </motion.div>
          ) : selectedSoftNote?.kind === 'soft' ? (
            <motion.p
              key="soft-note"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="mt-2 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300"
            >
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 dark:bg-amber-500" aria-hidden />
              {selectedSoftNote.reason}
            </motion.p>
          ) : null}
        </AnimatePresence>
      ) : null}
      {!slotBlock && !hideOccupancyOverlay && groupedBookedSlots.length > 0 ? (
        (() => {
          // From the listed items: the caller may have moved club bookings elsewhere.
          const hasExternalBooking = groupedBookedSlots.some((info) => info.clubBooked || info.holdBlocked);
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
                {t(hasExternalBooking ? 'createGame.overlapHardTitle' : 'createGame.overlapSoftTitle')}
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
                      {`• ${info.startTime} - ${info.endTime}${
                        !info.hasBookedCourt && !info.clubBooked && !info.holdBlocked
                          ? ` (${t('createGame.notConfirmed')})`
                          : ''
                      }`}
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
