/**
 * A thin bar of the game window: green where the court is held, amber where
 * it is not (a gap). A planned slot is an empty dashed track. Segments grow
 * in from the start edge (CSS, ≤ 200 ms) and ease to new widths; reduced
 * motion draws them in place. Logical insets, so time runs right-to-left in
 * RTL.
 */
import { parseInstantMs, type IsoInterval } from '@shared/gameBooking/coverageIntervals';
import { timelinePercent } from './courtReservationsModel';
import './courtReservations.css';

export type CoverageBarProps = {
  window: IsoInterval | null;
  reserved: readonly IsoInterval[];
  gaps: readonly IsoInterval[];
  planned?: boolean;
  className?: string;
};

export function CoverageBar({ window, reserved, gaps, planned = false, className }: CoverageBarProps) {
  const start = window ? parseInstantMs(window.start) : null;
  const end = window ? parseInstantMs(window.end) : null;
  const range = start != null && end != null && end > start ? { startMs: start, endMs: end } : null;

  const segments = range
    ? [
        ...reserved.map((i) => ({ kind: 'reserved' as const, i, p: timelinePercent(i, range) })),
        ...gaps.map((i) => ({ kind: 'gap' as const, i, p: timelinePercent(i, range) })),
      ].filter((s) => s.p != null)
    : [];

  return (
    <div
      aria-hidden
      className={`relative h-1.5 w-full overflow-hidden rounded-full ${
        planned
          ? 'border border-dashed border-amber-300 bg-transparent dark:border-amber-600/60'
          : 'bg-gray-100 dark:bg-gray-700/60'
      } ${className ?? ''}`}
    >
      {segments.map(({ kind, i, p }) => (
        <span
          key={`${kind}:${i.start}:${i.end}`}
          data-segment={kind}
          className={`cr-grow absolute inset-y-0 rounded-full transition-[inset-inline-start,width] duration-200 ease-out motion-reduce:transition-none ${
            kind === 'reserved' ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-amber-400 dark:bg-amber-500'
          }`}
          style={{ insetInlineStart: `${p!.offset}%`, width: `${p!.width}%` }}
        />
      ))}
    </div>
  );
}
