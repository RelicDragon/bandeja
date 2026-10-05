/**
 * Hour ticks under a timeline, in the club's zone. Logical insets (RTL-safe).
 * The edge labels are pulled inward so they never clip.
 */
import { hourTicks, timelinePercent, type TimelineRange } from './courtReservationsModel';
import type { ClubTimeFormatter } from './clubTime';

export function TimelineAxis({ range, clock, className }: { range: TimelineRange; clock: ClubTimeFormatter; className?: string }) {
  const ticks = hourTicks(range, clock.timeZone);
  const span = range.endMs - range.startMs;
  // Thin out labels on long ranges so they never collide on a phone.
  const every = span > 8 * 3_600_000 ? 3 : span > 5 * 3_600_000 ? 2 : 1;
  return (
    <div aria-hidden className={`relative h-4 text-[10px] tabular-nums text-gray-400 dark:text-gray-500 ${className ?? ''}`}>
      {ticks.map((ms, i) => {
        if (i % every !== 0) return null;
        const p = timelinePercent({ start: ms, end: ms + 1 }, range);
        if (!p) return null;
        const edge = p.offset < 4 ? 'translate-x-0' : p.offset > 96 ? '-translate-x-full rtl:translate-x-full' : '-translate-x-1/2 rtl:translate-x-1/2';
        return (
          <span key={ms} className={`absolute top-0 ${edge}`} style={{ insetInlineStart: `${p.offset}%` }}>
            {clock.time(ms)}
          </span>
        );
      })}
    </div>
  );
}

/** Faint vertical hour lines for a lane area. */
export function TimelineGrid({ range, timeZone }: { range: TimelineRange; timeZone: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {hourTicks(range, timeZone).map((ms) => {
        const p = timelinePercent({ start: ms, end: ms + 1 }, range);
        return p ? (
          <span
            key={ms}
            className="absolute inset-y-0 w-px bg-gray-100 dark:bg-gray-700/50"
            style={{ insetInlineStart: `${p.offset}%` }}
          />
        ) : null;
      })}
    </div>
  );
}
