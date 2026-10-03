import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Info } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import {
  SEGMENTED_SEAT_LIMIT,
  openSeats,
  seatStates,
  type RosterCounts,
  type RosterGroup,
  type SeatState,
} from './rosterModel';
import { OPEN_SEAT_CLASS, SEAT_CLASS } from './rosterTones';

/**
 * The seat strip: "how full" and "who is coming" in one glance. One segment
 * per seat, tinted by that player's answer; a dashed segment is an open spot.
 * From {@link SEGMENTED_SEAT_LIMIT} seats up it becomes one stacked bar.
 */

function Segment({ state, index }: { state: SeatState; index: number }) {
  const reduceMotion = usePrefersReducedMotion();
  return (
    <motion.span
      layout
      initial={reduceMotion ? false : { opacity: 0, scaleX: 0.6 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={reduceMotion ? { duration: 0 } : { delay: index * 0.03, duration: 0.25 }}
      className={`h-2 min-w-0 flex-1 rounded-full transition-colors duration-300 ${
        state ? SEAT_CLASS[state] : OPEN_SEAT_CLASS
      }`}
    />
  );
}

function StackedBar({ counts, open }: { counts: RosterCounts; open: number }) {
  const reduceMotion = usePrefersReducedMotion();
  const answered = counts.confirmed + counts.unsure + counts.unanswered + counts.noShow;
  const taken = counts.total - answered;
  const total = counts.total + open;
  if (total <= 0) return null;
  const parts: { key: string; value: number; className: string }[] = [
    { key: 'confirmed', value: counts.confirmed, className: SEAT_CLASS.CONFIRMED },
    { key: 'unsure', value: counts.unsure, className: SEAT_CLASS.UNSURE },
    { key: 'unanswered', value: counts.unanswered, className: SEAT_CLASS.UNANSWERED },
    { key: 'noShow', value: counts.noShow, className: SEAT_CLASS.NO_SHOW },
    { key: 'taken', value: taken, className: SEAT_CLASS.TAKEN },
    { key: 'open', value: open, className: `${OPEN_SEAT_CLASS} rounded-full` },
  ];
  return (
    <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full">
      {parts
        .filter((part) => part.value > 0)
        .map((part) => (
          <motion.span
            key={part.key}
            className={`h-full ${part.className}`}
            initial={false}
            animate={{ width: `${(part.value / total) * 100}%` }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 140, damping: 22 }}
          />
        ))}
    </div>
  );
}

function LegendDot({ className }: { className: string }) {
  return <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${className}`} />;
}

export function RosterSeatBar({
  groups,
  counts,
  hasAttendance,
  onLegend,
}: {
  groups: RosterGroup[];
  counts: RosterCounts;
  hasAttendance: boolean;
  onLegend?: () => void;
}) {
  const { t } = useTranslation();
  if (groups.some((group) => group.capacity == null)) return null;
  const capacity = groups.reduce((sum, group) => sum + (group.capacity ?? 0), 0);
  if (capacity <= 0) return null;
  const open = groups.reduce((sum, group) => sum + openSeats(group), 0);
  const stacked = capacity > SEGMENTED_SEAT_LIMIT;
  const split = groups.length > 1;

  const legend: { key: string; value: number; label: string; dot: string }[] = hasAttendance
    ? [
        { key: 'c', value: counts.confirmed, label: t('attendance.dots.confirmed'), dot: SEAT_CLASS.CONFIRMED },
        { key: 'u', value: counts.unsure, label: t('attendance.dots.unsure'), dot: SEAT_CLASS.UNSURE },
        {
          key: 'n',
          value: counts.unanswered,
          label: t('attendance.dots.unanswered'),
          dot: 'border-[1.5px] border-gray-400 dark:border-gray-500',
        },
        { key: 'x', value: counts.noShow, label: t('attendance.dots.noShow'), dot: SEAT_CLASS.NO_SHOW },
      ].filter((item) => item.value > 0)
    : [];

  return (
    <div className="mt-3">
      <div
        role={hasAttendance ? 'img' : undefined}
        aria-hidden={hasAttendance ? undefined : true}
        aria-label={
          hasAttendance
            ? t('attendance.roster.seatsAria', {
                confirmed: counts.confirmed,
                unsure: counts.unsure,
                unanswered: counts.unanswered,
                open,
              })
            : undefined
        }
      >
        {stacked ? (
          <StackedBar counts={counts} open={open} />
        ) : split ? (
          <div className="flex gap-2.5">
            {groups.map((group) => (
              <div key={group.key} className="min-w-0 flex-1">
                <div className="flex gap-[3px]">
                  {seatStates(group).map((state, index) => (
                    <Segment key={index} state={state} index={index} />
                  ))}
                </div>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {group.gender === 'FEMALE' ? t('games.female') : t('games.male')}{' '}
                  <span className="tabular-nums">
                    {group.rows.length}/{group.capacity}
                  </span>
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex gap-[3px]">
            {seatStates(groups[0]).map((state, index) => (
              <Segment key={index} state={state} index={index} />
            ))}
          </div>
        )}
      </div>

      {legend.length > 0 ? (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
            {legend.map((item, index) => (
              <span key={item.key} className="inline-flex items-center gap-1">
                {index > 0 ? (
                  <span aria-hidden className="me-0.5 text-gray-300 dark:text-gray-600">
                    ·
                  </span>
                ) : null}
                <LegendDot className={item.dot} />
                <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">
                  {item.value}
                </span>
                {item.label}
              </span>
            ))}
          </p>
          {hasAttendance && onLegend ? (
            <button
              type="button"
              onClick={onLegend}
              data-testid="attendance-legend-button"
              aria-label={t('attendance.legend.title')}
              className="relative -me-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors after:absolute after:-inset-2.5 after:content-[''] hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-500 dark:hover:text-gray-300"
            >
              <Info size={15} aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
