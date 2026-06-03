import React, { memo, useLayoutEffect, useRef, useState } from 'react';
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
const PLANNER_GAMES_PANEL_PX = 22;

function plannerAvatarRowWidthPx(itemCount: number, facePx: number): number {
  if (itemCount <= 0) return 0;
  return facePx + (itemCount - 1) * (facePx - PLANNER_AV_OVERLAP_PX);
}

function maxPlannerFacesThatFit(
  containerWidth: number,
  facePx: number,
  sampleLen: number,
  freeCount: number,
  reservedRightPx = 0
): number {
  const availableWidth = Math.max(0, containerWidth - reservedRightPx);
  if (freeCount <= 0 || availableWidth <= 0) return 0;
  const maxK = Math.min(sampleLen, freeCount);
  for (let k = maxK; k >= 1; k--) {
    const needBadge = freeCount > k;
    const items = needBadge ? k + 1 : k;
    if (plannerAvatarRowWidthPx(items, facePx) <= availableWidth) return k;
  }
  return plannerAvatarRowWidthPx(1, facePx) <= availableWidth ? 0 : 0;
}

function plannerSlotKey(day: LeaguePlannerDay, slot: LeaguePlannerDayHour) {
  return `${day.date}|${slot.hour}`;
}

const PlannerCellAvatarRow = memo(function PlannerCellAvatarRow({
  sampleFreeUsers,
  freeCount,
  cellWidth,
  reservedRightPx = 0,
}: {
  sampleFreeUsers: LeaguePlannerDayHour['sampleFreeUsers'];
  freeCount: number;
  cellWidth: number;
  reservedRightPx?: number;
}) {
  if (freeCount <= 0) return null;

  const visibleFaces =
    cellWidth > 0
      ? maxPlannerFacesThatFit(
          cellWidth,
          PLANNER_FACE_PX,
          sampleFreeUsers.length,
          freeCount,
          reservedRightPx
        )
      : Math.min(2, sampleFreeUsers.length, freeCount);
  const rest = freeCount - visibleFaces;
  const needPeopleBadge = rest > 0;
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
        {needPeopleBadge && (
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
  dateFnsLocale: Locale;
  timeFormat?: 'auto' | '12h' | '24h';
  onCellActivate: (day: LeaguePlannerDay, slot: LeaguePlannerDayHour) => void;
}

export const LeaguePlannerGrid = memo(function LeaguePlannerGrid({
  planner,
  dateFnsLocale,
  timeFormat,
  onCellActivate,
}: LeaguePlannerGridProps) {
  const { t } = useTranslation();

  const plannerDayShortLabel = (day: LeaguePlannerDay) =>
    `${getShortDayLabel(t, day.weekdayKey as WeekdayKey)} ${format(parseISO(day.date), 'd', { locale: dateFnsLocale })}`;

  const schedulableGameCount = (day: LeaguePlannerDay, slot: LeaguePlannerDayHour) =>
    (planner.schedulableBySlot[plannerSlotKey(day, slot)] ?? []).length;

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
  }, [planner.days.length]);

  const renderCellInner = (day: LeaguePlannerDay, slot: LeaguePlannerDayHour) => {
    const gameCount = day.isPast ? 0 : schedulableGameCount(day, slot);
    const hasGamesPanel = gameCount > 0;
    const gameLabel = gameCount > 99 ? '99+' : `${gameCount}`;

    return (
      <div className="flex h-full min-h-[2.25rem] w-full min-w-0 overflow-hidden">
        <div className="flex min-w-0 flex-1 items-center overflow-hidden px-1 py-0.5">
          <span className="sr-only">{formatHour(slot.hour, timeFormat)}</span>
          <PlannerCellAvatarRow
            sampleFreeUsers={slot.sampleFreeUsers}
            freeCount={slot.freeCount}
            cellWidth={cellWidth}
            reservedRightPx={hasGamesPanel ? PLANNER_GAMES_PANEL_PX : 0}
          />
        </div>
        {hasGamesPanel ? (
          <div
            className="flex w-[22px] shrink-0 flex-col items-center justify-center self-stretch border-l border-emerald-300/80 bg-emerald-100/95 text-[9px] font-bold leading-none tabular-nums text-emerald-800 dark:border-emerald-700/80 dark:bg-emerald-900/70 dark:text-emerald-100"
            aria-label={t('gameDetails.planner.matchesPossible', { count: gameCount })}
          >
            {gameLabel}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="overflow-x-auto">
      <div className="p-2 pt-3">
        <div
          className="grid w-full gap-1"
          style={{
            gridTemplateColumns: `3.5rem repeat(${planner.days.length}, minmax(7.5rem, 1fr))`,
          }}
        >
          <div />
          {planner.days.map((d, colIdx) => (
            <div
              key={d.date}
              ref={colIdx === 0 ? firstDayColRef : undefined}
              className={[
                'w-full px-1 py-2 text-center text-[11px] font-semibold leading-tight',
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
              {planner.days.map((day) => {
                const slot = day.hours.find((x) => x.hour === hour)!;
                return (
                  <button
                    key={`${day.date}-${hour}`}
                    type="button"
                    disabled={day.isPast}
                    onClick={() => onCellActivate(day, slot)}
                    className={[
                      'relative w-full min-h-[2.25rem] touch-manipulation overflow-hidden rounded-lg border p-0 text-left transition',
                      day.isPast
                        ? 'cursor-not-allowed border-gray-100 bg-gray-100/60 opacity-60 dark:border-gray-800 dark:bg-gray-900/40'
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
