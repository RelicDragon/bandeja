/**
 * The schedule grid. ONE scroll container; the column header row sticks to the top, the time
 * column sticks to the inline start, and the corner sticks to both. Every vertical position is
 * `calc(var(--ca-row-h) * fractionalRow)`, so slots, free cells and the "now" line share one
 * geometry by construction. Columns are courts (day view) or days (week view); each column
 * brings its own window instants (DST-correct) over shared wall-clock rows.
 *
 * Accessibility: every free cell and every booking is a button with a full label
 * ("Court 2, 18:00, free"); past cells are dimmed and say "past"; kinds differ by pattern as well
 * as colour. Desktop: press-and-drag down a column selects a range to block.
 */
import { memo, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Warehouse } from 'lucide-react';
import { useBookingText, VISUAL_CLASS, bookingVisual } from '../console/bookingText';
import type { ConsoleFormat } from '../console/format';
import { cx } from '../console/classes';
import { isOptimisticSlot } from '@/queries/clubAdmin/scheduleCache';
import {
  isRowOutsideHours,
  isRowPast,
  fractionalRow,
  type PlacedSlot,
  type ScheduleWindow,
} from './scheduleModel';

export interface GridColumn {
  key: string;
  title: string;
  subtitle?: string;
  isIndoor?: boolean;
  highlight?: boolean;
  window: ScheduleWindow;
  placed: PlacedSlot[];
  covered: boolean[];
  /** Free cells cannot be blocked here (unassigned lane, read-only role). */
  readOnly?: boolean;
}

export interface ScheduleGridProps {
  columns: GridColumn[];
  /** Wall-clock row minutes shared by every column. */
  rows: number[];
  nowMs: number;
  fmt: ConsoleFormat;
  selectedKey: string | null;
  onFreeRange: (column: GridColumn, fromRow: number, toRow: number) => void;
  onSlot: (column: GridColumn, placed: PlacedSlot) => void;
  /** Scroll so `row` is in view whenever `key` changes. */
  scrollTarget?: { row: number; key: string } | null;
  /** Fallback sizing for SSR/tests. */
  ariaLabel: string;
  fetching?: boolean;
}

const rowCalc = (n: number) => `calc(var(--ca-row-h) * ${n})`;

interface DragState {
  col: number;
  anchor: number;
  current: number;
}

const SlotButton = memo(function SlotButton({
  column,
  placed,
  fmt,
  past,
  selected,
  onSlot,
}: {
  column: GridColumn;
  placed: PlacedSlot;
  fmt: ConsoleFormat;
  past: boolean;
  selected: boolean;
  onSlot: (column: GridColumn, placed: PlacedSlot) => void;
}) {
  const { t } = useTranslation('clubAdmin');
  const text = useBookingText();
  const visual = bookingVisual(placed.slot);
  const optimistic = isOptimisticSlot(placed.slot);
  const conflict = placed.lanes > 1;
  const range = fmt.timeRange(placed.slot.startTime, placed.slot.endTime);
  const title = text.title(placed.slot);
  const label = [
    column.title,
    range,
    t(`schedule.kindLabel.${visual}`),
    title,
    text.detail(placed.slot),
    conflict ? t('schedule.overlapping') : null,
    past ? t('schedule.past') : null,
  ]
    .filter(Boolean)
    .join(', ');
  const tall = placed.endRow - placed.startRow >= 1.4;
  const style: CSSProperties = {
    top: rowCalc(placed.startRow),
    height: `max(${rowCalc(placed.endRow - placed.startRow)}, calc(var(--ca-row-h) * 0.5))`,
    insetInlineStart: `calc(${(placed.lane / placed.lanes) * 100}% + 2px)`,
    width: `calc(${100 / placed.lanes}% - 4px)`,
  };
  return (
    <button
      type="button"
      data-slot-key={placed.key}
      style={style}
      aria-label={label}
      aria-pressed={selected}
      disabled={optimistic}
      onClick={() => onSlot(column, placed)}
      className={cx(
        'absolute z-[2] flex flex-col items-start overflow-hidden rounded-lg px-1.5 py-1 text-start text-[11px] leading-tight shadow-sm transition-[box-shadow,opacity,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 focus-visible:ring-offset-background motion-reduce:transition-none',
        VISUAL_CLASS[visual],
        past && 'opacity-55',
        optimistic && 'animate-pulse opacity-70',
        selected && 'ring-2 ring-foreground ring-offset-1 ring-offset-background',
        conflict && !selected && 'outline outline-2 -outline-offset-2 outline-destructive',
        placed.clippedStart && 'rounded-t-none',
        placed.clippedEnd && 'rounded-b-none'
      )}
    >
      <span className="block w-full truncate font-semibold">{title}</span>
      {tall ? <span className="block w-full truncate tabular-nums opacity-80">{range}</span> : null}
    </button>
  );
});

function columnFreeCells(column: GridColumn, rowCount: number) {
  const out: number[] = [];
  for (let r = 0; r < rowCount; r += 1) if (!column.covered[r]) out.push(r);
  return out;
}

export function ScheduleGrid({
  columns,
  rows,
  nowMs,
  fmt,
  selectedKey,
  onFreeRange,
  onSlot,
  scrollTarget,
  ariaLabel,
  fetching,
}: ScheduleGridProps) {
  const { t } = useTranslation('clubAdmin');
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragMoved = useRef(false);
  const rowCount = rows.length;

  // Bring the interesting part of the day into view (once per target row).
  const targetKey = scrollTarget?.key;
  const targetRow = scrollTarget?.row;
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || targetKey === undefined || targetRow === undefined) return;
    // Measured row geometry: the first time-column row is the source of truth for --ca-row-h.
    const rowPx = el.querySelector<HTMLElement>('[data-row-probe]')?.offsetHeight || 44;
    el.scrollTo({ top: Math.max(0, targetRow * rowPx - rowPx), behavior: 'auto' });
  }, [targetKey, targetRow]);

  const endDrag = () => {
    if (drag) {
      const from = Math.min(drag.anchor, drag.current);
      const to = Math.max(drag.anchor, drag.current);
      const column = columns[drag.col];
      if (column && dragMoved.current) onFreeRange(column, from, to + 1);
    }
    setDrag(null);
  };

  const onCellPointerDown = (e: PointerEvent<HTMLButtonElement>, col: number, row: number) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    dragMoved.current = false;
    setDrag({ col, anchor: row, current: row });
  };

  const onCellPointerEnter = (col: number, row: number) => {
    if (!drag || drag.col !== col || drag.current === row) return;
    const column = columns[col];
    const lo = Math.min(drag.anchor, row);
    const hi = Math.max(drag.anchor, row);
    for (let r = lo; r <= hi; r += 1) if (column.covered[r]) return;
    dragMoved.current = true;
    setDrag({ ...drag, current: row });
  };

  const gridTemplateColumns = `var(--ca-time-col) repeat(${columns.length}, minmax(var(--ca-col-min), 1fr))`;
  const bodyHeight = rowCalc(rowCount);

  return (
    <div
      ref={scrollerRef}
      role="region"
      aria-label={ariaLabel}
      aria-busy={fetching || undefined}
      className="ca-grid relative h-full overflow-auto overscroll-contain"
      onPointerUp={endDrag}
      onPointerLeave={() => drag && endDrag()}
    >
      <div className="grid min-w-max" style={{ gridTemplateColumns }}>
        {/* Corner */}
        <div className="sticky start-0 top-0 z-30 flex h-12 items-center justify-center border-b border-e border-border bg-ca-surface">
          {fetching ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label={t('common.loading')} /> : null}
        </div>
        {/* Column headers */}
        {columns.map((c) => (
          <div
            key={`h:${c.key}`}
            className={cx(
              'sticky top-0 z-20 flex h-12 min-w-0 flex-col justify-center border-b border-e border-border bg-ca-surface px-2 text-center',
              c.highlight && 'text-primary-700 dark:text-primary-300'
            )}
          >
            <span className="flex min-w-0 items-center justify-center gap-1">
              <span className="truncate text-[13px] font-semibold">{c.title}</span>
              {c.isIndoor ? (
                <Warehouse className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={t('schedule.indoorCourt')} role="img" />
              ) : null}
            </span>
            {c.subtitle ? <span className="truncate text-[11px] text-muted-foreground">{c.subtitle}</span> : null}
          </div>
        ))}

        {/* Time column */}
        <div className="sticky start-0 z-10 border-e border-border bg-ca-surface" style={{ height: bodyHeight }}>
          {rows.map((m, i) => (
            <div
              key={m}
              data-row-probe={i === 0 ? '' : undefined}
              className="relative border-b border-ca-line"
              style={{ height: 'var(--ca-row-h)' }}
            >
              <span className="absolute -top-px start-0 end-1 text-end text-[11px] font-medium text-muted-foreground tabular-nums">
                {i === 0 || m % 60 === 0 ? fmt.wallTime(m) : <span className="opacity-60">{fmt.wallTime(m)}</span>}
              </span>
            </div>
          ))}
        </div>

        {/* Columns */}
        {columns.map((c, ci) => {
          const nowFrac =
            nowMs >= c.window.rowInstants[0] && nowMs <= c.window.rowInstants[c.window.rowInstants.length - 1]
              ? fractionalRow(c.window, nowMs)
              : null;
          const dragLo = drag && drag.col === ci ? Math.min(drag.anchor, drag.current) : -1;
          const dragHi = drag && drag.col === ci ? Math.max(drag.anchor, drag.current) : -1;
          return (
            <div key={`c:${c.key}`} className="relative border-e border-border" style={{ height: bodyHeight }}>
              {/* Row backgrounds: hour lines, outside-hours shading, past dimming. */}
              {rows.map((m, r) => (
                <div
                  key={m}
                  aria-hidden
                  className={cx(
                    'absolute inset-x-0 border-b',
                    m % 60 === 0 ? 'border-border/70' : 'border-ca-line',
                    isRowOutsideHours(c.window, r) ? 'bg-ca-sunken' : '',
                    isRowPast(c.window, r, nowMs) ? 'bg-ca-sunken/60' : ''
                  )}
                  style={{ top: rowCalc(r), height: 'var(--ca-row-h)' }}
                />
              ))}
              {/* Free cells */}
              {columnFreeCells(c, rowCount).map((r) => {
                const past = isRowPast(c.window, r, nowMs);
                const inDrag = r >= dragLo && r <= dragHi;
                const time = fmt.wallTime(rows[r]);
                const label = past
                  ? t('schedule.cell.past', { court: c.title, time })
                  : c.readOnly
                    ? t('schedule.cell.freeReadOnly', { court: c.title, time })
                    : t('schedule.cell.free', { court: c.title, time });
                return (
                  <button
                    key={`f:${r}`}
                    type="button"
                    aria-label={label}
                    aria-disabled={past || c.readOnly || undefined}
                    tabIndex={past || c.readOnly ? -1 : 0}
                    onPointerDown={(e) => onCellPointerDown(e, ci, r)}
                    onPointerEnter={() => onCellPointerEnter(ci, r)}
                    onClick={() => {
                      if (past || c.readOnly || dragMoved.current) return;
                      onFreeRange(c, r, r + 1);
                    }}
                    className={cx(
                      'group absolute inset-x-0 z-[1] select-none focus-visible:outline-none',
                      past || c.readOnly ? 'cursor-default' : 'cursor-pointer'
                    )}
                    style={{ top: rowCalc(r), height: 'var(--ca-row-h)' }}
                  >
                    <span
                      aria-hidden
                      className={cx(
                        'absolute inset-[3px] rounded-md transition-colors duration-100',
                        inDrag
                          ? 'bg-primary-500/25 ring-1 ring-primary-500'
                          : past || c.readOnly
                            ? ''
                            : 'group-hover:bg-primary-500/10 group-focus-visible:bg-primary-500/15 group-focus-visible:ring-2 group-focus-visible:ring-primary-500'
                      )}
                    />
                  </button>
                );
              })}
              {/* Bookings */}
              {c.placed.map((p) => (
                <SlotButton
                  key={p.key}
                  column={c}
                  placed={p}
                  fmt={fmt}
                  past={p.endMs <= nowMs}
                  selected={selectedKey === `${c.key}|${p.key}`}
                  onSlot={onSlot}
                />
              ))}
              {/* Now line */}
              {nowFrac !== null ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-[3] h-0.5 bg-ca-now"
                  style={{ top: rowCalc(nowFrac) }}
                >
                  {ci === 0 ? <span className="absolute -start-1 -top-[3px] h-2 w-2 rounded-full bg-ca-now" /> : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
