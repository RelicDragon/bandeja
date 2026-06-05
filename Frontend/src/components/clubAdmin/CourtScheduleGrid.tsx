import { Fragment, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Court } from '@/types';
import { ScheduleSlot } from '@/api/clubAdmin';
import { UNASSIGNED_COURT_ID } from '@/utils/clubAdmin/constants';
import { clubLocalDateString, clubLocalNowMinutes, clubLocalTimeMinutes } from '@/utils/clubAdmin/scheduleTime';
import { generateTimeSlots, resolveSlotMinutes } from '@/utils/clubSchedule/timeSlots';
import { adminSlotKind, slotClassName } from '@/utils/clubSchedule/slotStyle';

interface CourtScheduleGridProps {
  courts: Court[];
  slots: ScheduleSlot[];
  scheduleDate: string;
  openingTime?: string | null;
  closingTime?: string | null;
  slotMinutes?: number | null;
  club?: { city?: { timezone?: string } | null } | null;
  readOnly?: boolean;
  onSlotClick?: (courtId: string, time: string, slot?: ScheduleSlot, isPast?: boolean) => void;
}

function parseMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function slotAt(
  slots: ScheduleSlot[],
  courtId: string,
  time: string,
  stepMinutes: number,
  club?: { city?: { timezone?: string } | null } | null
): ScheduleSlot | undefined {
  const startMin = parseMinutes(time);
  const endMin = startMin + stepMinutes;
  return slots.find((s) => {
    if (courtId === UNASSIGNED_COURT_ID) {
      if (s.type !== 'game' || s.courtId !== null) return false;
    } else if (s.type === 'game' && s.courtId === null) {
      return false;
    } else if (s.courtId !== courtId) {
      return false;
    }
    const sh = clubLocalTimeMinutes(s.startTime, club);
    const eh = clubLocalTimeMinutes(s.endTime, club);
    return sh < endMin && eh > startMin;
  });
}

export function CourtScheduleGrid({
  courts,
  slots,
  scheduleDate,
  openingTime,
  closingTime,
  slotMinutes: slotMinutesProp,
  club,
  readOnly,
  onSlotClick,
}: CourtScheduleGridProps) {
  const { t } = useTranslation();
  const stepMinutes = resolveSlotMinutes(slotMinutesProp);

  const times = useMemo(
    () => generateTimeSlots(openingTime, closingTime, stepMinutes),
    [openingTime, closingTime, stepMinutes]
  );

  const activeCourts = courts.filter((c) => c.isActive !== false);
  const hasUnassigned = slots.some((s) => s.type === 'game' && s.courtId === null);

  const columns = useMemo(() => {
    const cols: Array<{ id: string; name: string; isActive: boolean }> = activeCourts.map((c) => ({
      id: c.id,
      name: c.name,
      isActive: c.isActive !== false,
    }));
    if (hasUnassigned) {
      cols.push({
        id: UNASSIGNED_COURT_ID,
        name: t('clubAdmin.unassignedCourt'),
        isActive: true,
      });
    }
    return cols;
  }, [activeCourts, hasUnassigned, t]);

  const todayStr = useMemo(() => clubLocalDateString(club), [club]);
  const isToday = scheduleDate === todayStr;
  const nowMinutes = useMemo(() => {
    if (!isToday) return null;
    return clubLocalNowMinutes(club);
  }, [isToday, club]);

  const nowRowIndex = useMemo(() => {
    if (nowMinutes == null) return -1;
    for (let i = 0; i < times.length; i++) {
      const start = parseMinutes(times[i]);
      const end = start + stepMinutes;
      if (nowMinutes >= start && nowMinutes < end) return i;
    }
    return -1;
  }, [times, nowMinutes, stepMinutes]);

  const isPastDate = scheduleDate < todayStr;
  const isSlotPast = (time: string) => {
    if (isPastDate) return true;
    if (!isToday || nowMinutes == null) return false;
    return parseMinutes(time) + stepMinutes <= nowMinutes;
  };

  const nowLineTop =
    nowRowIndex >= 0
      ? `calc(2rem + ${nowRowIndex} * 2rem + 1rem)`
      : undefined;

  return (
    <div className="relative overflow-x-auto rounded-lg border border-border">
      {nowLineTop && (
        <div
          className="pointer-events-none absolute left-0 right-0 z-20 border-t-2 border-primary-500"
          style={{ top: nowLineTop }}
          aria-hidden
        />
      )}
      <div
        className="grid min-w-max gap-px bg-border"
        style={{
          gridTemplateColumns: `4rem repeat(${Math.max(columns.length, 1)}, minmax(4.5rem, 1fr))`,
        }}
      >
        <div className="sticky left-0 z-10 bg-muted p-1" />
        {columns.map((c) => (
          <div
            key={c.id}
            className="sticky top-0 z-10 bg-muted p-1 text-center text-xs font-medium truncate"
          >
            {c.name}
          </div>
        ))}
        {times.map((time, rowIndex) => (
          <Fragment key={time}>
            <div className="sticky left-0 z-10 flex items-center bg-background p-1 text-xs text-muted-foreground">
              {time}
              {rowIndex === nowRowIndex && (
                <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-primary-500" aria-hidden />
              )}
            </div>
            {columns.map((court) => {
              const slot = slotAt(slots, court.id, time, stepMinutes, club);
              const past = isSlotPast(time);
              const kind = slot
                ? adminSlotKind(slot)
                : court.isActive === false
                  ? 'inactive'
                  : 'free';
              return (
                <button
                  key={`${court.id}-${time}`}
                  type="button"
                  className={`min-h-8 p-0.5 ${slotClassName(kind)} ${past ? 'opacity-60' : ''}`}
                  onClick={() => onSlotClick?.(court.id, time, slot, past)}
                  disabled={readOnly && !slot}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
