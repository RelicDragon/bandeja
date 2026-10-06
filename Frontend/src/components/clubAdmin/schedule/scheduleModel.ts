/**
 * Schedule grid model — pure. Turns one schedule response into
 *   - the day window (club wall-clock rows, overnight-aware, widened to cover every slot),
 *   - court columns (sorted, + "Unassigned" lane),
 *   - a slot index: court → sorted placed intervals with fractional row positions and overlap lanes,
 *   - per-court covered-row bitmaps so free cells need no per-cell scans.
 * Rows are club wall-clock minutes; each row's instant is computed once (DST-correct), and slot
 * positions come from a binary search over those instants — no Intl work per slot or per cell.
 */
import type {
  HoldLabel,
  ClubAdminCourtRef,
  ClubScheduleResponseV2,
  ScheduleSlotV2,
} from '@shared/clubAdmin/contract';
import {
  clubWallTimeToUtc,
  isClubTime,
  scheduleRowMinutes,
  timeToMinutes,
} from '@shared/clubAdmin/clubTime';
import type { LegacyClubInfo } from '@/queries/clubAdmin';

export const UNASSIGNED_COURT = '__unassigned__';
export const HOLD_LABELS: HoldLabel[] = ['WALK_IN', 'PHONE', 'ACADEMY', 'MAINTENANCE', 'OTHER'];
export const DEFAULT_OPEN = '08:00';
export const DEFAULT_CLOSE = '23:00';
export const DEFAULT_SLOT_MINUTES = 30;
const MIN_STEP = 15;

export interface ScheduleCourtColumn {
  key: string;
  id: string | null;
  name: string;
  isIndoor: boolean;
  isActive: boolean;
}

export interface ScheduleWindow {
  date: string;
  timeZone: string;
  step: number;
  /** Row start minutes from the date's midnight (may exceed 1440 for overnight clubs). */
  rows: number[];
  /** `rows.length + 1` instants (ms): each row start, then the window end. */
  rowInstants: number[];
  /** Club has no opening hours this day (v2 `hours: null`). */
  closed: boolean;
  /** Configured opening window (minutes from midnight), before widening; null when closed. */
  openMin: number | null;
  closeMin: number | null;
}

export interface PlacedSlot {
  slot: ScheduleSlotV2;
  key: string;
  courtKey: string;
  startMs: number;
  endMs: number;
  /** Fractional row positions within the window, clamped to [0, rows]. */
  startRow: number;
  endRow: number;
  lane: number;
  lanes: number;
  /** The slot starts before / ends after the visible window. */
  clippedStart: boolean;
  clippedEnd: boolean;
}

export interface ScheduleModel {
  window: ScheduleWindow;
  courts: ScheduleCourtColumn[];
  index: Map<string, PlacedSlot[]>;
  /** court key → row index → covered by at least one slot. */
  covered: Map<string, boolean[]>;
}

export function slotKey(slot: ScheduleSlotV2): string {
  switch (slot.type) {
    case 'hold':
      return `hold:${slot.holdId}`;
    case 'external':
      return `external:${slot.courtId}:${slot.startTime}`;
    default:
      return `game:${slot.gameId}:${slot.courtId ?? UNASSIGNED_COURT}`;
  }
}

export function slotCourtKey(slot: ScheduleSlotV2): string {
  return slot.courtId ?? UNASSIGNED_COURT;
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function snapDown(m: number, step: number) {
  return Math.floor(m / step) * step;
}

function snapUp(m: number, step: number) {
  return Math.ceil(m / step) * step;
}

export interface WindowInput {
  date: string;
  timeZone: string;
  response: Pick<ClubScheduleResponseV2, 'hours' | 'slotMinutes' | 'slots'> | undefined;
  legacy: LegacyClubInfo | null | undefined;
  /** Force the row range (minutes from midnight) — week view aligns seven days on one axis. */
  range?: { start: number; end: number; step: number };
}

export function resolveScheduleWindow({ date, timeZone, response, legacy, range }: WindowInput): ScheduleWindow {
  const step = Math.max(MIN_STEP, Math.floor(response?.slotMinutes ?? legacy?.defaultSlotMinutes ?? DEFAULT_SLOT_MINUTES));
  let open: string;
  let close: string;
  let closed = false;
  if (response && response.hours !== undefined) {
    if (response.hours === null) {
      closed = true;
      open = DEFAULT_OPEN;
      close = DEFAULT_CLOSE;
    } else {
      open = response.hours.open;
      close = response.hours.close;
    }
  } else if (isClubTime(legacy?.openingTime) && isClubTime(legacy?.closingTime)) {
    open = legacy.openingTime;
    close = legacy.closingTime;
  } else {
    open = DEFAULT_OPEN;
    close = DEFAULT_CLOSE;
  }
  if (!isClubTime(open) || !isClubTime(close)) {
    open = DEFAULT_OPEN;
    close = DEFAULT_CLOSE;
  }

  const configuredRows = scheduleRowMinutes(open, close, step);
  const openMin = timeToMinutes(open);
  let closeMin = timeToMinutes(close);
  if (closeMin <= openMin) closeMin += 1440;
  let start = snapDown(openMin, step);
  let end = configuredRows.length > 0 ? configuredRows[configuredRows.length - 1] + step : closeMin;

  // Widen to every slot of the day so nothing booked is ever invisible.
  const slots = response?.slots ?? [];
  if (slots.length > 0) {
    const dayStart = clubWallTimeToUtc(date, 0, timeZone).getTime();
    for (const s of slots) {
      const a = (Date.parse(s.startTime) - dayStart) / 60_000;
      const b = (Date.parse(s.endTime) - dayStart) / 60_000;
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      start = Math.min(start, snapDown(Math.max(0, a), step));
      end = Math.max(end, snapUp(Math.min(b, start + 1440 * 2), step));
    }
  }
  end = Math.min(end, start + 1440 + step * 4);
  let rowStep = step;
  if (range) {
    start = range.start;
    end = range.end;
    rowStep = range.step;
  }

  const rows: number[] = [];
  for (let m = start; m < end; m += rowStep) rows.push(m);
  const rowInstants = [...rows, end].map((m) => clubWallTimeToUtc(date, m, timeZone).getTime());
  return {
    date,
    timeZone,
    step: rowStep,
    rows,
    rowInstants,
    closed,
    openMin: closed ? null : openMin,
    closeMin: closed ? null : closeMin,
  };
}

/** Fractional row position of an instant, clamped to [0, rows]. Binary search, no Intl. */
export function fractionalRow(window: Pick<ScheduleWindow, 'rowInstants'>, ms: number): number {
  const inst = window.rowInstants;
  const n = inst.length - 1;
  if (n <= 0) return 0;
  if (ms <= inst[0]) return 0;
  if (ms >= inst[n]) return n;
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (inst[mid] <= ms) lo = mid;
    else hi = mid;
  }
  const span = inst[lo + 1] - inst[lo];
  return span > 0 ? lo + (ms - inst[lo]) / span : lo;
}

/** Row is entirely before `nowMs`. */
export function isRowPast(window: Pick<ScheduleWindow, 'rowInstants'>, row: number, nowMs: number): boolean {
  return window.rowInstants[row + 1] <= nowMs;
}

/** Row is outside the configured opening hours (shown, but shaded). */
export function isRowOutsideHours(window: ScheduleWindow, row: number): boolean {
  if (window.closed) return true;
  if (window.openMin === null || window.closeMin === null) return false;
  const m = window.rows[row];
  return m < window.openMin || m >= window.closeMin;
}

// ---------------------------------------------------------------------------
// Courts
// ---------------------------------------------------------------------------

export function resolveCourts(
  response: Pick<ClubScheduleResponseV2, 'courts' | 'slots'> | undefined,
  legacy: LegacyClubInfo | null | undefined,
  unassignedLabel: string
): ScheduleCourtColumn[] {
  const refs: ClubAdminCourtRef[] = response?.courts ?? legacy?.courts ?? [];
  const slots = response?.slots ?? [];
  const used = new Set(slots.map(slotCourtKey));
  const sorted = [...refs].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const cols: ScheduleCourtColumn[] = sorted
    .filter((c) => c.isActive || used.has(c.id))
    .map((c) => ({ key: c.id, id: c.id, name: c.name, isIndoor: c.isIndoor, isActive: c.isActive }));
  const known = new Set(cols.map((c) => c.key));
  for (const s of slots) {
    const key = slotCourtKey(s);
    if (key === UNASSIGNED_COURT || known.has(key)) continue;
    known.add(key);
    cols.push({
      key,
      id: key,
      name: s.type === 'external' && s.courtName ? s.courtName : key.slice(0, 6),
      isIndoor: false,
      isActive: false,
    });
  }
  if (used.has(UNASSIGNED_COURT)) {
    cols.push({ key: UNASSIGNED_COURT, id: null, name: unassignedLabel, isIndoor: false, isActive: false });
  }
  return cols;
}

// ---------------------------------------------------------------------------
// Slot index
// ---------------------------------------------------------------------------

/** Assign side-by-side lanes to overlapping intervals (sorted by start). */
export function assignLanes(items: PlacedSlot[]): void {
  let cluster: PlacedSlot[] = [];
  let clusterEnd = -Infinity;
  const laneEnds: number[] = [];
  const flush = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const p of cluster) p.lanes = lanes;
    cluster = [];
    laneEnds.length = 0;
  };
  for (const p of items) {
    if (p.startMs >= clusterEnd && cluster.length > 0) flush();
    let lane = laneEnds.findIndex((end) => end <= p.startMs);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(p.endMs);
    } else {
      laneEnds[lane] = p.endMs;
    }
    p.lane = lane;
    cluster.push(p);
    clusterEnd = Math.max(clusterEnd, p.endMs);
  }
  if (cluster.length > 0) flush();
}

export function buildSlotIndex(slots: ScheduleSlotV2[], window: ScheduleWindow): Map<string, PlacedSlot[]> {
  const index = new Map<string, PlacedSlot[]>();
  const first = window.rowInstants[0];
  const last = window.rowInstants[window.rowInstants.length - 1];
  for (const slot of slots) {
    const startMs = Date.parse(slot.startTime);
    const endMs = Date.parse(slot.endTime);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    if (endMs <= first || startMs >= last) continue;
    const courtKey = slotCourtKey(slot);
    const placed: PlacedSlot = {
      slot,
      key: slotKey(slot),
      courtKey,
      startMs,
      endMs,
      startRow: fractionalRow(window, startMs),
      endRow: fractionalRow(window, endMs),
      lane: 0,
      lanes: 1,
      clippedStart: startMs < first,
      clippedEnd: endMs > last,
    };
    const list = index.get(courtKey);
    if (list) list.push(placed);
    else index.set(courtKey, [placed]);
  }
  for (const list of index.values()) {
    list.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    assignLanes(list);
  }
  return index;
}

const EPS = 1e-6;

/** Row bitmap per court: true where any slot covers part of the row. */
export function coveredRows(index: Map<string, PlacedSlot[]>, rowCount: number): Map<string, boolean[]> {
  const out = new Map<string, boolean[]>();
  for (const [court, list] of index) {
    const rows = new Array<boolean>(rowCount).fill(false);
    for (const p of list) {
      const from = Math.max(0, Math.floor(p.startRow + EPS));
      const to = Math.min(rowCount, Math.ceil(p.endRow - EPS));
      for (let r = from; r < to; r += 1) rows[r] = true;
    }
    out.set(court, rows);
  }
  return out;
}

export function buildScheduleModel(input: WindowInput & { unassignedLabel: string }): ScheduleModel {
  const window = resolveScheduleWindow(input);
  const courts = resolveCourts(input.response, input.legacy, input.unassignedLabel);
  const index = buildSlotIndex(input.response?.slots ?? [], window);
  const covered = coveredRows(index, window.rows.length);
  return { window, courts, index, covered };
}

/** Pixel geometry from measured row height. */
export function slotRect(p: Pick<PlacedSlot, 'startRow' | 'endRow' | 'lane' | 'lanes'>, rowHeight: number) {
  const top = p.startRow * rowHeight;
  const height = Math.max(rowHeight * 0.5, (p.endRow - p.startRow) * rowHeight);
  return {
    top,
    height,
    insetStartPct: (p.lane / p.lanes) * 100,
    widthPct: 100 / p.lanes,
  };
}

/** Vertical position of the "now" line in px, or null when now is outside the window. */
export function nowLineTop(window: Pick<ScheduleWindow, 'rowInstants'>, nowMs: number, rowHeight: number): number | null {
  const inst = window.rowInstants;
  if (inst.length < 2 || nowMs < inst[0] || nowMs > inst[inst.length - 1]) return null;
  return fractionalRow(window, nowMs) * rowHeight;
}

/** Does a `focus` id from Today / Bookings (`game:<id>…`, `hold:<id>`, `external:…`) point at this slot? */
export function matchesFocus(focus: string, slot: ScheduleSlotV2): boolean {
  const [kind, id] = focus.split(':');
  if (kind === 'hold') return slot.type === 'hold' && slot.holdId === id;
  if (kind === 'game') return (slot.type === 'game' || slot.type === 'game_court') && slot.gameId === id;
  if (kind === 'external') return slot.type === 'external' && focus === `external:${slot.courtId}:${slot.startTime}`;
  return false;
}
