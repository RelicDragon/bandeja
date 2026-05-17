import React, { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import type { Locale } from 'date-fns';
import { PlayerAvatar } from '@/components';
import type {
  LeaguePlannerDay,
  LeaguePlannerDayHour,
  LeaguePlannerPayload,
} from '@/api/leagues';
import { formatHour, getShortDayLabel } from '@/utils/availability/format';
import type { BasicUser, WeekdayKey } from '@/types';

const PLANNER_HOURS = Array.from({ length: 24 }, (_, h) => h);
const PLANNER_FACE_PX = 24;
const PLANNER_AV_OVERLAP_PX = 6;

function plannerAvatarRowWidthPx(itemCount: number, facePx: number): number {
  if (itemCount <= 0) return 0;
  return facePx + (itemCount - 1) * (facePx - PLANNER_AV_OVERLAP_PX);
}

function maxPlannerFacesThatFit(
  containerWidth: number,
  facePx: number,
  sampleLen: number,
  freeCount: number
): number {
  if (freeCount <= 0 || containerWidth <= 0) return 0;
  const maxK = Math.min(sampleLen, freeCount);
  for (let k = maxK; k >= 1; k--) {
    const needBadge = freeCount > k;
    const items = needBadge ? k + 1 : k;
    if (plannerAvatarRowWidthPx(items, facePx) <= containerWidth) return k;
  }
  return plannerAvatarRowWidthPx(1, facePx) <= containerWidth ? 0 : 0;
}

function plannerSlotKey(day: LeaguePlannerDay, slot: LeaguePlannerDayHour) {
  return `${day.date}|${slot.hour}`;
}

const PlannerCellAvatarRow = memo(function PlannerCellAvatarRow({
  sampleFreeUsers,
  freeCount,
  cellWidth,
}: {
  sampleFreeUsers: LeaguePlannerDayHour['sampleFreeUsers'];
  freeCount: number;
  cellWidth: number;
}) {
  if (freeCount <= 0) return null;

  const visibleFaces =
    cellWidth > 0
      ? maxPlannerFacesThatFit(cellWidth, PLANNER_FACE_PX, sampleFreeUsers.length, freeCount)
      : Math.min(2, sampleFreeUsers.length, freeCount);
  const rest = freeCount - visibleFaces;
  const needBadge = rest > 0;
  const restLabel = rest > 99 ? '99+' : `${rest}+`;

  return (
    <div className="w-full min-w-0 overflow-hidden">
      <div className="flex items-center justify-start -space-x-1.5">
        {sampleFreeUsers.slice(0, visibleFaces).map((u, i) => (
          <span
            key={u.id}
            className="relative flex shrink-0 rounded-full ring-2 ring-white dark:ring-gray-900"
            style={{ zIndex: i + 1 }}
          >
            <PlayerAvatar
              player={u as BasicUser}
              inlineFace
              inlineFacePlain
              inlineFaceFlatStack
              inlineFaceSize="sm"
              showName={false}
              subscribePresence={false}
              asDiv
            />
          </span>
        ))}
        {needBadge && (
          <span
            className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[8px] font-bold leading-none tabular-nums text-gray-800 ring-2 ring-white dark:bg-gray-600 dark:text-gray-100 dark:ring-gray-900"
            style={{ zIndex: visibleFaces + 10 }}
            aria-label={rest > 99 ? '99 or more additional' : `${rest} additional`}
          >
            {restLabel}
          </span>
        )}
      </div>
    </div>
  );
});

export interface LeaguePlannerGridProps {
  planner: LeaguePlannerPayload;
  todayStr: string;
  dateFnsLocale: Locale;
  timeFormat?: 'auto' | '12h' | '24h';
  onCellActivate: (day: LeaguePlannerDay, slot: LeaguePlannerDayHour) => void;
}

export const LeaguePlannerGrid = memo(function LeaguePlannerGrid({
  planner,
  todayStr,
  dateFnsLocale,
  timeFormat,
  onCellActivate,
}: LeaguePlannerGridProps) {
  const { t } = useTranslation();

  const visibleDays = useMemo(
    () => planner.days.filter((d) => d.date >= todayStr),
    [planner.days, todayStr]
  );

  const plannerDayShortLabel = (day: LeaguePlannerDay) =>
    `${getShortDayLabel(t, day.weekdayKey as WeekdayKey)} ${format(parseISO(day.date), 'd', { locale: dateFnsLocale })}`;

  const isSchedulableSlot = (day: LeaguePlannerDay, slot: LeaguePlannerDayHour) => {
    if (day.isPast) return false;
    return (planner.schedulableBySlot[plannerSlotKey(day, slot)] ?? []).length > 0;
  };

  const firstDayColRef = useRef<HTMLDivElement>(null);
  const [cellWidth, setCellWidth] = useState(0);

  useLayoutEffect(() => {
    const el = firstDayColRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setCellWidth(w);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [visibleDays.length]);

  const renderCellInner = (day: LeaguePlannerDay, slot: LeaguePlannerDayHour) => {
    const schedulable = isSchedulableSlot(day, slot);
    return (
      <div className="relative flex h-full min-h-[2rem] w-full min-w-0 flex-col items-stretch justify-center gap-0.5 p-0.5">
        {schedulable ? (
          <span
            className="pointer-events-none absolute inset-0.5 rounded-md ring-2 ring-emerald-500/80 ring-offset-1 ring-offset-white dark:ring-offset-gray-900"
            aria-hidden
          />
        ) : null}
        <div className="flex w-full min-w-0 flex-col items-center justify-center gap-0.5 overflow-visible">
          <span className="sr-only">{formatHour(slot.hour, timeFormat)}</span>
          <PlannerCellAvatarRow
            sampleFreeUsers={slot.sampleFreeUsers}
            freeCount={slot.freeCount}
            cellWidth={cellWidth}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="overflow-x-auto">
      <div className="p-2 pt-3">
        <div
          className="grid min-w-[720px] gap-1"
          style={{ gridTemplateColumns: `auto repeat(${visibleDays.length}, minmax(0, 1fr))` }}
        >
          <div />
          {visibleDays.map((d, colIdx) => (
            <div
              key={d.date}
              ref={colIdx === 0 ? firstDayColRef : undefined}
              className={[
                'px-1 py-2 text-center text-[11px] font-semibold leading-tight',
                d.isPast ? 'text-gray-400' : 'text-gray-800 dark:text-gray-100',
              ].join(' ')}
            >
              {plannerDayShortLabel(d)}
            </div>
          ))}
          {PLANNER_HOURS.map((hour) => (
            <React.Fragment key={hour}>
              <span
                className={[
                  'select-none pr-1.5 text-right text-[10px] leading-5 tabular-nums',
                  hour % 3 === 0
                    ? 'font-medium text-gray-600 dark:text-gray-300'
                    : 'text-gray-400 dark:text-gray-500',
                ].join(' ')}
              >
                {formatHour(hour, timeFormat)}
              </span>
              {visibleDays.map((day) => {
                const slot = day.hours.find((x) => x.hour === hour)!;
                const schedSlot = isSchedulableSlot(day, slot);
                return (
                  <button
                    key={`${day.date}-${hour}`}
                    type="button"
                    disabled={day.isPast}
                    onClick={() => onCellActivate(day, slot)}
                    className={[
                      'relative min-h-[2.25rem] min-w-0 touch-manipulation rounded-lg border text-left transition',
                      day.isPast
                        ? 'cursor-not-allowed border-gray-100 bg-gray-100/60 opacity-60 dark:border-gray-800 dark:bg-gray-900/40'
                        : schedSlot
                          ? 'border-emerald-200/90 bg-emerald-50/95 hover:border-emerald-400/80 hover:shadow-md dark:border-emerald-800/70 dark:bg-emerald-950/45 dark:hover:border-emerald-600'
                          : 'border-gray-200 bg-white hover:border-primary-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800/80 dark:hover:border-primary-700',
                    ].join(' ')}
                  >
                    {renderCellInner(day, slot)}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
});
