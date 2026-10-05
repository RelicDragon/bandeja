/**
 * Court lanes for the reschedule sheet.
 *
 * One lane per court the game uses, plus a dashed "ghost" lane for each court
 * a switch would move it to ("Court 5 · free"), so the organizer sees where
 * the game goes. On every lane, at a glance and without a legend:
 *  - club bookings / holds — grey hatching;
 *  - other app games — solid slate (planned ones: dashed outline);
 *  - this game's reservations — green outline;
 *  - a court reserved with the club (reported) — a dotted green outline;
 *  - the game itself — a primary-tinted block per lane (hollow on a court the
 *    game leaves). Red appears only for a real clash, and only over the
 *    minutes that clash.
 * A small legend lists only the kinds actually on screen.
 *
 * The game is one draggable column (15-minute snap) that is also a keyboard
 * slider (←/→/↑/↓ = 15 min, PageUp/PageDown = 1 h, Home/End = bounds).
 * Steppers for start and length sit below as the precise, accessible path.
 */
import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { IsoInterval } from '@shared/gameBooking/coverageIntervals';
import { MINUTE_MS, parseInstantMs } from '@shared/gameBooking/coverageIntervals';
import type { OccupancyBlock } from '@shared/gameBooking/planReschedule';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { timelinePercent, type TimelineRange } from './courtReservationsModel';
import { TimelineAxis, TimelineGrid } from './TimelineAxis';
import { SNAP_MINUTES, type DraftWindow } from './useReschedulePlan';
import type { CourtReservationText } from './useCourtReservationText';

export type TimelineLane = {
  key: string;
  label: string;
  courtId: string | null;
  /** This game's own reservations on the lane. */
  reservations: readonly IsoInterval[];
  /** A real clash at the draft time (drawn red, only where it clashes). */
  clash: boolean;
  /** `ghost`: a court the game would switch to; `leaving`: a court the game would leave. */
  variant?: 'default' | 'ghost' | 'leaving';
  /** Small line under the label ("free", "→ Court 5"). */
  caption?: string;
  /** The court is reserved with the club (no provider link): dotted marker over `reportedWindow`. */
  reported?: boolean;
  reportedWindow?: IsoInterval | null;
};

export type RescheduleTimelineProps = {
  lanes: readonly TimelineLane[];
  occupancy: readonly OccupancyBlock[];
  range: TimelineRange;
  currentWindow: IsoInterval;
  draft: DraftWindow;
  text: CourtReservationText;
  onDraftChange: (draft: DraftWindow) => void;
  onShiftStart: (minutes: number) => void;
  onChangeLength: (minutes: number) => void;
};

const HATCH =
  'bg-[repeating-linear-gradient(135deg,var(--color-gray-300)_0_3px,var(--color-gray-100)_3px_7px)] dark:bg-[repeating-linear-gradient(135deg,var(--color-gray-500)_0_3px,var(--color-gray-700)_3px_7px)]';

const BLOCK_CLASS: Record<OccupancyBlock['kind'], string> = {
  club: `${HATCH} ring-1 ring-inset ring-gray-300 dark:ring-gray-600`,
  hold: `${HATCH} ring-1 ring-inset ring-gray-300 dark:ring-gray-600`,
  app_game_reserved: 'bg-slate-300 dark:bg-slate-600',
  app_game_planned: 'border border-dashed border-slate-400 bg-slate-100 dark:border-slate-500 dark:bg-slate-700/50',
};

const HARD = new Set<OccupancyBlock['kind']>(['club', 'hold', 'app_game_reserved']);

type LegendKind = 'club' | 'game' | 'reserved' | 'reported';

const LANE_HEIGHT = 52;
const TRACK_INSET = 6;

function isRtl(el: HTMLElement | null): boolean {
  if (!el || typeof getComputedStyle !== 'function') return false;
  return getComputedStyle(el).direction === 'rtl';
}

function Stepper({
  label,
  value,
  decLabel,
  incLabel,
  onDec,
  onInc,
}: {
  label: string;
  value: string;
  decLabel: string;
  incLabel: string;
  onDec: () => void;
  onInc: () => void;
}) {
  const btn =
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 active:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700 dark:active:bg-gray-600';
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-1 items-center justify-between rounded-2xl bg-gray-50 px-0.5 dark:bg-gray-900/60">
      <button type="button" className={btn} aria-label={decLabel} onClick={onDec}>
        <Minus size={18} aria-hidden />
      </button>
      <span className="flex min-w-0 flex-col items-center leading-tight">
        <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</span>
        <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-gray-900 dark:text-white" aria-live="polite">
          {value}
        </span>
      </span>
      <button type="button" className={btn} aria-label={incLabel} onClick={onInc}>
        <Plus size={18} aria-hidden />
      </button>
    </div>
  );
}

function clip(a: { start: number; end: number }, b: { start: number; end: number }) {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
}

export function RescheduleTimeline({
  lanes,
  occupancy,
  range,
  currentWindow,
  draft,
  text,
  onDraftChange,
  onShiftStart,
  onChangeLength,
}: RescheduleTimelineProps) {
  const { t, clock } = text;
  const reduceMotion = usePrefersReducedMotion();
  const areaRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; draft: DraftWindow; rtl: boolean; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const game = timelinePercent({ start: draft.startMs, end: draft.endMs }, range);
  const original = timelinePercent(currentWindow, range);
  const moved =
    parseInstantMs(currentWindow.start) !== draft.startMs || parseInstantMs(currentWindow.end) !== draft.endMs;
  const spanMinutes = (range.endMs - range.startMs) / MINUTE_MS;
  const lengthMs = draft.endMs - draft.startMs;

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const area = areaRef.current;
      if (!area) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      dragRef.current = { x: e.clientX, draft, rtl: isRtl(area), width: area.getBoundingClientRect().width || 1 };
      setDragging(true);
    },
    [draft],
  );
  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (!d) return;
      const dxMinutes = ((e.clientX - d.x) / d.width) * spanMinutes * (d.rtl ? -1 : 1);
      const snapped = Math.round(dxMinutes / SNAP_MINUTES) * SNAP_MINUTES;
      const next = { startMs: d.draft.startMs + snapped * MINUTE_MS, endMs: d.draft.endMs + snapped * MINUTE_MS };
      if (next.startMs !== draft.startMs) onDraftChange(next);
    },
    [draft.startMs, onDraftChange, spanMinutes],
  );
  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const rtl = isRtl(areaRef.current);
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowRight': {
          e.preventDefault();
          const forward = (e.key === 'ArrowRight') !== rtl;
          onShiftStart(forward ? SNAP_MINUTES : -SNAP_MINUTES);
          break;
        }
        case 'ArrowUp':
        case 'ArrowDown':
          e.preventDefault();
          onShiftStart(e.key === 'ArrowUp' ? SNAP_MINUTES : -SNAP_MINUTES);
          break;
        case 'PageUp':
        case 'PageDown':
          e.preventDefault();
          onShiftStart(e.key === 'PageUp' ? 60 : -60);
          break;
        case 'Home':
          e.preventDefault();
          onDraftChange({ startMs: range.startMs, endMs: range.startMs + lengthMs });
          break;
        case 'End':
          e.preventDefault();
          onDraftChange({ startMs: range.endMs - lengthMs, endMs: range.endMs });
          break;
        default:
      }
    },
    [lengthMs, onDraftChange, onShiftStart, range.endMs, range.startMs],
  );

  const lengthMinutes = Math.round(lengthMs / MINUTE_MS);
  const draftMs = { start: draft.startMs, end: draft.endMs };

  const legend = new Set<LegendKind>();
  const laneBlocks = lanes.map((lane) => {
    const blocks = occupancy.filter((b) => lane.courtId && b.courtId === lane.courtId);
    for (const b of blocks) {
      if (!timelinePercent(b, range)) continue;
      legend.add(b.kind === 'club' || b.kind === 'hold' ? 'club' : 'game');
    }
    if (lane.reservations.length > 0) legend.add('reserved');
    if (lane.reported) legend.add('reported');
    return blocks;
  });
  const legendItems: { kind: LegendKind; swatch: string; label: string }[] = [
    { kind: 'reserved' as const, swatch: 'border-[1.5px] border-emerald-500 bg-emerald-500/15 dark:border-emerald-400', label: t('timeline.legend.reserved') },
    { kind: 'reported' as const, swatch: 'border-[1.5px] border-dotted border-emerald-500 dark:border-emerald-400', label: t('timeline.legend.reported') },
    { kind: 'club' as const, swatch: HATCH, label: t('timeline.legend.club') },
    { kind: 'game' as const, swatch: 'bg-slate-300 dark:bg-slate-600', label: t('timeline.legend.game') },
  ].filter((item) => legend.has(item.kind));

  const ease = reduceMotion || dragging ? '' : 'transition-[inset-inline-start,width] duration-200 ease-out';

  return (
    <div>
      <div className="flex gap-2">
        <ul className="flex w-20 shrink-0 flex-col" aria-hidden>
          {lanes.map((lane) => (
            <li key={lane.key} className="flex min-w-0 flex-col justify-center" style={{ height: LANE_HEIGHT }}>
              <span
                className={`truncate text-xs font-medium ${
                  lane.clash
                    ? 'text-red-600 dark:text-red-400'
                    : lane.variant === 'ghost'
                      ? 'text-primary-700 dark:text-primary-300'
                      : lane.variant === 'leaving'
                        ? 'text-gray-400 dark:text-gray-500'
                        : 'text-gray-700 dark:text-gray-200'
                }`}
              >
                {lane.label}
              </span>
              {lane.caption ? (
                <span className="truncate text-[10px] leading-tight text-gray-500 dark:text-gray-400">{lane.caption}</span>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="min-w-0 flex-1">
          <div ref={areaRef} data-vaul-no-drag="" className="relative touch-pan-y select-none" style={{ height: lanes.length * LANE_HEIGHT }}>
            <TimelineGrid range={range} timeZone={clock.timeZone} />
            {lanes.map((lane, i) => {
              const hardClash = lane.clash
                ? laneBlocks[i]
                    .filter((b) => HARD.has(b.kind))
                    .map((b) => {
                      const s = parseInstantMs(b.start);
                      const e = parseInstantMs(b.end);
                      return s != null && e != null ? clip({ start: s, end: e }, draftMs) : null;
                    })
                    .filter((x): x is { start: number; end: number } => x != null)
                : [];
              const gameStyle =
                lane.variant === 'leaving'
                  ? 'border border-dashed border-gray-300 bg-transparent dark:border-gray-600'
                  : lane.clash
                    ? 'border-2 border-primary-500/70 bg-primary-500/10 dark:border-primary-400/70'
                    : 'border-2 border-primary-500 bg-primary-500/20 dark:border-primary-400 dark:bg-primary-400/20';
              return (
                <div
                  key={lane.key}
                  aria-hidden
                  data-lane-variant={lane.variant ?? 'default'}
                  data-lane-clash={lane.clash || undefined}
                  className={`absolute inset-x-0 rounded-lg ${
                    lane.variant === 'ghost'
                      ? 'border border-dashed border-primary-300 bg-primary-50/40 dark:border-primary-700 dark:bg-primary-950/20'
                      : 'bg-gray-100/70 dark:bg-gray-900/50'
                  }`}
                  style={{ top: i * LANE_HEIGHT + TRACK_INSET, height: LANE_HEIGHT - TRACK_INSET * 2 }}
                >
                  {laneBlocks[i].map((b) => {
                    const p = timelinePercent(b, range);
                    return p ? (
                      <span
                        key={`${b.kind}:${b.start}:${b.gameId ?? ''}`}
                        data-block-kind={b.kind}
                        className={`absolute inset-y-0 rounded-md ${BLOCK_CLASS[b.kind]}`}
                        style={{ insetInlineStart: `${p.offset}%`, width: `${p.width}%` }}
                      />
                    ) : null;
                  })}
                  {lane.reservations.map((r) => {
                    const p = timelinePercent(r, range);
                    return p ? (
                      <span
                        key={`res:${r.start}`}
                        data-own-reservation=""
                        className="absolute inset-y-1 rounded-md border-[1.5px] border-emerald-500 bg-emerald-500/15 dark:border-emerald-400 dark:bg-emerald-400/15"
                        style={{ insetInlineStart: `${p.offset}%`, width: `${p.width}%` }}
                      />
                    ) : null;
                  })}
                  {lane.reported && lane.reportedWindow
                    ? (() => {
                        const p = timelinePercent(lane.reportedWindow, range);
                        return p ? (
                          <span
                            data-reported-marker=""
                            className="absolute inset-y-1 rounded-md border-[1.5px] border-dotted border-emerald-500 dark:border-emerald-400"
                            style={{ insetInlineStart: `${p.offset}%`, width: `${p.width}%` }}
                          />
                        ) : null;
                      })()
                    : null}
                  {game ? (
                    <span
                      className={`pointer-events-none absolute inset-y-0.5 rounded-md ${gameStyle} ${ease}`}
                      style={{ insetInlineStart: `${game.offset}%`, width: `${game.width}%` }}
                    />
                  ) : null}
                  {hardClash.map((c) => {
                    const p = timelinePercent(c, range);
                    return p ? (
                      <span
                        key={`clash:${c.start}`}
                        data-clash-marker=""
                        className={`pointer-events-none absolute inset-y-0 rounded-md bg-red-500/30 ring-2 ring-inset ring-red-500 dark:bg-red-500/30 dark:ring-red-400 ${ease}`}
                        style={{ insetInlineStart: `${p.offset}%`, width: `${p.width}%` }}
                      />
                    ) : null;
                  })}
                  {lane.variant === 'ghost' && lane.caption ? <span className="sr-only">{lane.caption}</span> : null}
                </div>
              );
            })}
            {original && moved ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 rounded-xl border border-dashed border-gray-400/80 dark:border-gray-500/80"
                style={{ insetInlineStart: `${original.offset}%`, width: `${original.width}%` }}
              />
            ) : null}
            {game ? (
              <div
                role="slider"
                tabIndex={0}
                aria-label={t('move.dragLabel')}
                aria-orientation="horizontal"
                aria-valuemin={0}
                aria-valuemax={Math.max(0, Math.round((range.endMs - range.startMs - lengthMs) / MINUTE_MS))}
                aria-valuenow={Math.round((draft.startMs - range.startMs) / MINUTE_MS)}
                aria-valuetext={t('move.sliderValue', { start: clock.time(draft.startMs), end: clock.time(draft.endMs) })}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={onKeyDown}
                className={`absolute inset-y-0 cursor-grab touch-none rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 ${
                  dragging ? 'cursor-grabbing bg-primary-500/5' : ''
                } ${ease}`}
                style={{ insetInlineStart: `${game.offset}%`, width: `${game.width}%` }}
              >
                <span className="pointer-events-none absolute -top-1 start-1/2 h-1.5 w-7 -translate-x-1/2 rounded-full bg-primary-500 shadow-sm rtl:translate-x-1/2 dark:bg-primary-400" />
              </div>
            ) : null}
          </div>
          <TimelineAxis range={range} clock={clock} className="mt-1" />
        </div>
      </div>
      {legendItems.length > 1 ? (
        <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-gray-500 dark:text-gray-400" aria-hidden>
          {legendItems.map((item) => (
            <li key={item.kind} className="flex items-center gap-1">
              <span className={`inline-block h-2.5 w-3.5 rounded-[3px] ${item.swatch}`} />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-center text-base font-semibold tabular-nums text-gray-900 dark:text-white">
        {clock.range(draft.startMs, draft.endMs)}
      </p>
      <p className="text-center text-[11px] text-gray-500 dark:text-gray-400">{t('move.dragHint')}</p>
      <div className="mt-3 flex gap-2">
        <Stepper
          label={t('move.start')}
          value={clock.time(draft.startMs)}
          decLabel={t('move.earlier')}
          incLabel={t('move.later')}
          onDec={() => onShiftStart(-SNAP_MINUTES)}
          onInc={() => onShiftStart(SNAP_MINUTES)}
        />
        <Stepper
          label={t('move.length')}
          value={text.compactDuration(lengthMinutes)}
          decLabel={t('move.shorter')}
          incLabel={t('move.longer')}
          onDec={() => onChangeLength(-SNAP_MINUTES)}
          onInc={() => onChangeLength(SNAP_MINUTES)}
        />
      </div>
    </div>
  );
}
