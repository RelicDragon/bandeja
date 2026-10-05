/**
 * Pure decisions for the Courts card and the court-slot sheet:
 *  - the ONE primary action of the card ({@link courtsPrimaryAction}),
 *  - the ≤3 contextual actions of a slot ({@link slotSheetActions}),
 *  - the `PUT /games/:id/court-slots` body for an edit ({@link buildCourtSlotsBody}),
 *  - timeline geometry ({@link timelinePercent}) shared by every bar.
 *
 * No React, no clock, no I/O.
 */
import type {
  CourtReservationsResult,
  CourtSlotReservation,
  CourtSlotView,
  GameCourtSlotInput,
} from '@shared/gameBooking/courtReservations';
import { MINUTE_MS, parseInstantMs, type IsoInterval } from '@shared/gameBooking/coverageIntervals';
import {
  resolveProviderCapabilities,
  type ProviderCapabilityOverrides,
} from '@shared/gameBooking/providerCapabilities';
import { isSyntheticGameCourtId } from './courtReservationsInput';

export type CourtRef = {
  id: string;
  name: string;
  externalCourtId?: string | null;
  isIndoor?: boolean;
};

/* ------------------------------------------------------------------ *
 * Card primary action
 * ------------------------------------------------------------------ */

export type CourtsPrimaryAction =
  | { kind: 'reserve'; count: number; remaining: boolean; slotKeys: string[] }
  | { kind: 'fill_gap'; slotKey: string; gap: IsoInterval; minutes: number; gapCount: number };

/**
 * Planned slots first (nothing else matters until every court is held), then
 * the earliest gap. `null` when everything is reserved, nothing can be acted
 * on, or the viewer cannot edit.
 */
export function courtsPrimaryAction(
  result: Pick<CourtReservationsResult, 'slots' | 'summary'>,
  options: { canEdit: boolean },
): CourtsPrimaryAction | null {
  if (!options.canEdit) return null;
  const planned = result.slots.filter((s) => s.state === 'planned');
  if (planned.length > 0) {
    return {
      kind: 'reserve',
      count: planned.length,
      remaining: planned.length < result.slots.length,
      slotKeys: planned.map((s) => s.key),
    };
  }
  if (result.summary.kind === 'reserved_with_gap') {
    const gap = result.summary.earliestGap;
    const start = parseInstantMs(gap.start);
    const end = parseInstantMs(gap.end);
    const minutes = start != null && end != null ? Math.round((end - start) / MINUTE_MS) : 0;
    return {
      kind: 'fill_gap',
      slotKey: gap.slotKey,
      gap: { start: gap.start, end: gap.end },
      minutes,
      gapCount: result.summary.gapCount,
    };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Slot sheet actions
 * ------------------------------------------------------------------ */

export type SlotActionKind =
  | 'reserve'
  | 'link'
  | 'mark_reserved'
  | 'mark_not_reserved'
  | 'verify'
  | 'unlink'
  | 'cancel_at_club'
  /** Give the slot a court (or another court) without touching its reservation. Opt-in: `canAssignCourt`. */
  | 'assign_court';

export type SlotActionSpec = {
  kind: SlotActionKind;
  /** The one filled button of the sheet. */
  primary: boolean;
  /** Destructive styling (red text, never filled). */
  destructive: boolean;
  /** The link this action targets (linked slots). */
  linkId?: string;
};

export type SlotActionContext = {
  canEdit: boolean;
  /** The club has a booking integration the viewer can book through. */
  canBookHere: boolean;
  /** The linked reservation is also used by other games (never cancelled from here). */
  shared: boolean;
  /** Provider has a live lookup (`ClubBookingProvider.verifyBooking`). */
  canVerify?: (provider: string) => boolean;
  providerCapabilities?: ProviderCapabilityOverrides;
};

export const MAX_SLOT_ACTIONS = 3;

/**
 * Standalone court choice in the slot sheet (opt-in):
 *  - `assign`: an "Any court" slot (not linked) can just get a court — no
 *    reservation decision forced;
 *  - `change`: a planned slot that has a court can take another one;
 *  - `none`: otherwise (reserved courts move through the reschedule flow).
 */
export type CourtPickMode = 'none' | 'assign' | 'change';

export function courtPickMode(
  slot: Pick<CourtSlotView, 'state' | 'courtId'>,
  ctx: { canEdit: boolean; canAssignCourt: boolean; pickableCourtIds: readonly string[] },
): CourtPickMode {
  if (!ctx.canEdit || !ctx.canAssignCourt) return 'none';
  const others = ctx.pickableCourtIds.filter((id) => id !== slot.courtId);
  if (others.length === 0) return 'none';
  if (slot.courtId == null && slot.state !== 'linked') return 'assign';
  if (slot.courtId != null && slot.state === 'planned') return 'change';
  return 'none';
}

export function slotSheetActions(
  slot: Pick<CourtSlotView, 'state' | 'links' | 'provider'>,
  ctx: SlotActionContext,
): SlotActionSpec[] {
  if (!ctx.canEdit) return [];
  const out: SlotActionSpec[] = [];
  if (slot.state === 'planned') {
    if (ctx.canBookHere) out.push({ kind: 'reserve', primary: true, destructive: false });
    out.push({ kind: 'link', primary: !ctx.canBookHere, destructive: false });
    out.push({ kind: 'mark_reserved', primary: false, destructive: false });
  } else if (slot.state === 'reported') {
    out.push({ kind: 'link', primary: true, destructive: false });
    out.push({ kind: 'mark_not_reserved', primary: false, destructive: true });
  } else {
    const link = slot.links[0];
    const provider = slot.provider ?? link?.provider ?? null;
    const caps = resolveProviderCapabilities(provider, ctx.providerCapabilities);
    if (provider && ctx.canVerify?.(provider)) {
      out.push({ kind: 'verify', primary: true, destructive: false, linkId: link?.id });
    }
    out.push({ kind: 'unlink', primary: false, destructive: false, linkId: link?.id });
    if (caps?.canCancel && !ctx.shared && link) {
      out.push({ kind: 'cancel_at_club', primary: false, destructive: true, linkId: link.id });
    }
  }
  return out.slice(0, MAX_SLOT_ACTIONS);
}

/* ------------------------------------------------------------------ *
 * PUT /games/:id/court-slots body
 * ------------------------------------------------------------------ */

export type CourtSlotsBody = {
  slots: Array<{ courtId: string; reservation: CourtSlotReservation }>;
  reportedAnyCourtCount: number;
  /** Organizer-chosen number of courts; omitted when the game uses the default. */
  courtSlotCount?: number;
};

export type CourtSlotsState = {
  gameCourts: readonly GameCourtSlotInput[];
  /** Any-court slots currently reported (already clamped by the view). */
  reportedAnyCourtCount: number;
  /** `Game.courtSlotCount` (null/absent = default). */
  courtSlotCount?: number | null;
};

export type CourtSlotsChange =
  | { kind: 'mark_reserved'; slot: Pick<CourtSlotView, 'gameCourtId' | 'courtId'>; courtId?: string | null }
  | { kind: 'mark_not_reserved'; slot: Pick<CourtSlotView, 'gameCourtId' | 'courtId'> }
  | { kind: 'assign_court'; slot: Pick<CourtSlotView, 'gameCourtId' | 'courtId'>; courtId: string }
  | { kind: 'reassign_court'; fromCourtId: string | null; toCourtId: string }
  /** "Courts: − N +". Never below the assigned courts. */
  | { kind: 'set_count'; count: number };

/** Count of reported any-court slots in a derived view (what the server should store). */
export function reportedAnyCourtCountOf(slots: readonly Pick<CourtSlotView, 'gameCourtId' | 'state'>[]): number {
  return slots.filter((s) => s.gameCourtId == null && s.state === 'reported').length;
}

/**
 * The full slot list after one edit. Assigned courts keep their order and
 * reservation; a court newly given to an any-court slot is appended (and the
 * any-court report it replaces is released). Synthetic legacy slots are sent
 * as plain courts — the server creates the real row.
 */
export function buildCourtSlotsBody(state: CourtSlotsState, change: CourtSlotsChange): CourtSlotsBody {
  const slots = [...state.gameCourts]
    .sort((a, b) => a.order - b.order)
    .map((gc) => ({ courtId: gc.courtId, reservation: gc.reservation, gameCourtId: gc.gameCourtId }));
  let reportedAny = Math.max(0, state.reportedAnyCourtCount);
  let courtSlotCount =
    typeof state.courtSlotCount === 'number' && state.courtSlotCount > 0 ? state.courtSlotCount : undefined;
  const findAssigned = (slot: Pick<CourtSlotView, 'gameCourtId' | 'courtId'>) =>
    slot.gameCourtId != null
      ? slots.find((s) => s.gameCourtId === slot.gameCourtId) ??
        (isSyntheticGameCourtId(slot.gameCourtId) ? slots.find((s) => s.courtId === slot.courtId) : undefined)
      : undefined;
  const append = (courtId: string, reservation: CourtSlotReservation) => {
    const existing = slots.find((s) => s.courtId === courtId);
    if (existing) {
      if (reservation === 'REPORTED') existing.reservation = 'REPORTED';
      return;
    }
    slots.push({ courtId, reservation, gameCourtId: `new:${courtId}` });
  };

  switch (change.kind) {
    case 'mark_reserved': {
      const assigned = findAssigned(change.slot);
      if (assigned) assigned.reservation = 'REPORTED';
      else if (change.courtId) append(change.courtId, 'REPORTED');
      else reportedAny += 1;
      break;
    }
    case 'mark_not_reserved': {
      const assigned = findAssigned(change.slot);
      if (assigned) assigned.reservation = 'NONE';
      else reportedAny = Math.max(0, reportedAny - 1);
      break;
    }
    case 'assign_court': {
      const assigned = findAssigned(change.slot);
      if (assigned) {
        if (!slots.some((s) => s !== assigned && s.courtId === change.courtId)) assigned.courtId = change.courtId;
      } else {
        append(change.courtId, 'NONE');
      }
      break;
    }
    case 'reassign_court': {
      const from = change.fromCourtId ? slots.find((s) => s.courtId === change.fromCourtId) : undefined;
      const targetTaken = slots.some((s) => s.courtId === change.toCourtId);
      if (from && targetTaken) {
        slots.splice(slots.indexOf(from), 1);
      } else if (from) {
        from.courtId = change.toCourtId;
        from.reservation = 'NONE';
      } else if (!targetTaken) {
        slots.push({ courtId: change.toCourtId, reservation: 'NONE', gameCourtId: `new:${change.toCourtId}` });
      }
      break;
    }
    case 'set_count': {
      courtSlotCount = Math.max(1, slots.length, Math.floor(change.count));
      reportedAny = Math.min(reportedAny, courtSlotCount - slots.length);
      break;
    }
  }

  return {
    slots: slots.map(({ courtId, reservation }) => ({ courtId, reservation })),
    reportedAnyCourtCount: reportedAny,
    ...(courtSlotCount != null ? { courtSlotCount } : {}),
  };
}

/** Bounds for the "Courts: − N +" stepper: never fewer than the assigned courts. */
export function courtCountBounds(assignedCourtCount: number, max = 16): { min: number; max: number } {
  const min = Math.max(1, assignedCourtCount);
  return { min, max: Math.max(min, max) };
}

/* ------------------------------------------------------------------ *
 * Timeline geometry
 * ------------------------------------------------------------------ */

export type TimelineRange = { startMs: number; endMs: number };

/** `[start, end)` of `interval` as percentages of `range`, clipped to 0–100. `null` when outside. */
export function timelinePercent(
  interval: { start: string | number; end: string | number },
  range: TimelineRange,
): { offset: number; width: number } | null {
  const toMs = (v: string | number) => (typeof v === 'number' ? v : parseInstantMs(v));
  const s = toMs(interval.start);
  const e = toMs(interval.end);
  const span = range.endMs - range.startMs;
  if (s == null || e == null || e <= s || span <= 0) return null;
  const cs = Math.max(s, range.startMs);
  const ce = Math.min(e, range.endMs);
  if (ce <= cs) return null;
  return { offset: ((cs - range.startMs) / span) * 100, width: ((ce - cs) / span) * 100 };
}

/** Linked coverage segments of a slot clipped to the game window, for the thin bar. */
export function slotCoverageSegments(
  slot: Pick<CourtSlotView, 'state' | 'links' | 'gaps'>,
  window: IsoInterval,
): { reserved: IsoInterval[]; gaps: IsoInterval[] } {
  if (slot.state === 'planned') return { reserved: [], gaps: [] };
  if (slot.state === 'reported') return { reserved: [window], gaps: [] };
  const reserved = slot.links
    .filter((l) => l.startMs != null && l.endMs != null)
    .map((l) => ({ start: new Date(l.startMs as number).toISOString(), end: new Date(l.endMs as number).toISOString() }));
  if (reserved.length === 0) return { reserved: [window], gaps: [] };
  return { reserved, gaps: slot.gaps };
}

/**
 * Game window ± `padMinutes`, snapped outward to half hours (half, not whole:
 * a UTC hour is not a local hour in +05:30 zones; hour ticks are placed by
 * {@link hourTicks} in the club's zone).
 */
export function paddedTimelineRange(windows: readonly IsoInterval[], padMinutes = 60): TimelineRange | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const w of windows) {
    const s = parseInstantMs(w.start);
    const e = parseInstantMs(w.end);
    if (s == null || e == null) continue;
    min = Math.min(min, s);
    max = Math.max(max, e);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
  const step = 30 * MINUTE_MS;
  return {
    startMs: Math.floor((min - padMinutes * MINUTE_MS) / step) * step,
    endMs: Math.ceil((max + padMinutes * MINUTE_MS) / step) * step,
  };
}

/** Local minute-of-hour of `ms` in `timeZone` (0–59). */
function localMinuteOfHour(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, minute: '2-digit' }).formatToParts(new Date(ms));
  return Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
}

/** Instants of every local full hour inside `range`, in the club's zone. */
export function hourTicks(range: TimelineRange, timeZone: string): number[] {
  const out: number[] = [];
  const first = range.startMs + ((60 - localMinuteOfHour(range.startMs, timeZone)) % 60) * MINUTE_MS;
  const aligned = first - (first % MINUTE_MS);
  for (let ms = aligned; ms <= range.endMs; ms += 60 * MINUTE_MS) out.push(ms);
  return out;
}
