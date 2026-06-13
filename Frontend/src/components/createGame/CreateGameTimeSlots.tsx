import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EntityType, Club } from '@/types';
import { CourtDisplayName } from '@/components/CourtDisplayName';
import { SelectedTimeSummary } from '@/components/createGame/SelectedTimeSummary';

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
}: CreateGameTimeSlotsProps) {
  const { t } = useTranslation();

  const groupedBookedSlots = useMemo(
    () => (bookedSlotInfo && bookedSlotInfo.length > 0 ? groupBookedSlots(bookedSlotInfo) : []),
    [bookedSlotInfo],
  );

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
        {t('createGame.selectTime')}
        {timezoneLabel ? (
          <span className="ml-2 text-gray-500 dark:text-gray-500 font-normal">
            ({t('createGame.clubTime')} {timezoneLabel})
          </span>
        ) : null}
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
          {times.map((time) => {
            const isSelected = selectedTime === time;
            const isHighlighted = entityType !== 'BAR' ? isSlotHighlighted(time) : false;
            const canAccommodate = entityType !== 'BAR' ? canAccommodateDuration(time, duration) : true;
            const isBooked = !hideOccupancyOverlay && isSlotBooked(time);
            const allUnconfirmed = isBooked && areAllSlotsUnconfirmed(time);
            const isExternallyBooked = isBooked && hasExternallyBookedSlot(time);
            const isHardBlocked = isBooked && isSlotHardBlocked(time);

            const blockHardBookedSlot = hideOccupancyOverlay && isHardBlocked;

            const handleTimeClick = () => {
              if (entityType !== 'BAR' && blockHardBookedSlot) return;
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
      {!slotsLoading ? (
        <SelectedTimeSummary
          selectedTime={selectedTime}
          duration={duration}
          durationLabel={entityType !== 'BAR' && duration ? getDurationLabel(duration) : undefined}
          entityType={entityType}
        />
      ) : null}
      {!hideOccupancyOverlay && groupedBookedSlots.length > 0 ? (
        (() => {
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
