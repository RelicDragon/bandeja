/**
 * Create-game court plan — the pure core behind the Location step's
 * "Courts" stepper, the court chips and "At the club?".
 *
 * A plan is N ordered slots. A slot is "Any court" (`courtId: null`) or a
 * picked court, and is reserved when a provider reservation is linked to it
 * (`bookingId`) or when the organizer marked it reserved (`reported`, sent as
 * `REPORTED`). Linked slots always take the reservation's court.
 *
 * No clock, no I/O: the hook (`useCreateGameCourtPlan`) feeds occupancy blocks
 * and windows in epoch ms.
 */
import type { EntityType } from '@/types';
import type { CourtSlotReservation } from '@shared/gameBooking/courtReservations';
import type { OccupancyBlock } from '@shared/gameBooking/planReschedule';

/**
 * `gameOnly`: the organizer handles the court outside the app — the club's
 * schedule is never checked and never blocks (`Game.courtBookingMode = GAME_ONLY`).
 */
export type AtClubChoice = 'reserveNow' | 'alreadyReserved' | 'notYet' | 'gameOnly';

export const AT_CLUB_CHOICES: readonly AtClubChoice[] = ['reserveNow', 'alreadyReserved', 'notYet', 'gameOnly'];

export type CourtPlanSlot = {
  courtId: string | null;
  /** Provider reservation linked to this slot. */
  bookingId: string | null;
  /** Organizer says this court is reserved (by phone, at the desk…). */
  reported: boolean;
};

/** Server cap for `PUT /games/:id/court-slots`. */
export const MAX_COURT_SLOTS = 16;

export function emptyCourtSlot(reported = false): CourtPlanSlot {
  return { courtId: null, bookingId: null, reported };
}

export function assignedCourtIds(slots: readonly CourtPlanSlot[]): string[] {
  const out: string[] = [];
  for (const slot of slots) {
    if (slot.courtId && !out.includes(slot.courtId)) out.push(slot.courtId);
  }
  return out;
}

export function linkedBookingIds(slots: readonly CourtPlanSlot[]): string[] {
  return slots.map((s) => s.bookingId).filter((id): id is string => Boolean(id));
}

/** Stepper bounds: at least one court and every linked reservation; at most the club's courts (≤ 16). */
export function courtSlotBounds(eligibleCourtCount: number, linkedCount: number): { min: number; max: number } {
  const min = Math.max(1, linkedCount);
  const clubMax = eligibleCourtCount > 0 ? eligibleCourtCount : MAX_COURT_SLOTS;
  return { min, max: Math.max(min, Math.min(MAX_COURT_SLOTS, clubMax)) };
}

/** Picked courts first (unique, in order), then "Any court" slots up to `count`. */
export function seedCourtSlots(courtIds: readonly string[], count: number, reported = false): CourtPlanSlot[] {
  const unique = [...new Set(courtIds.filter(Boolean))];
  const total = Math.max(1, count, unique.length);
  return Array.from({ length: total }, (_, i) => ({
    courtId: unique[i] ?? null,
    bookingId: null,
    reported,
  }));
}

/**
 * Grow with "Any court" slots, or shrink from the end. Linked slots are never
 * dropped: a shrink stops once only linked slots would go.
 */
export function resizeCourtSlots(slots: readonly CourtPlanSlot[], count: number, reported = false): CourtPlanSlot[] {
  const target = Math.max(1, Math.floor(count));
  if (target === slots.length) return slots as CourtPlanSlot[];
  if (target > slots.length) {
    return [...slots, ...Array.from({ length: target - slots.length }, () => emptyCourtSlot(reported))];
  }
  const next = [...slots];
  for (let i = next.length - 1; i >= 0 && next.length > target; i -= 1) {
    if (!next[i].bookingId) next.splice(i, 1);
  }
  return next;
}

/**
 * Give slot `index` a court (`null` = Any court). A court already on another
 * slot swaps places with this slot's court. Linked slots keep the
 * reservation's court; a court held by another slot's reservation is refused.
 */
export function assignSlotCourt(
  slots: readonly CourtPlanSlot[],
  index: number,
  courtId: string | null,
): CourtPlanSlot[] {
  const slot = slots[index];
  if (!slot || slot.bookingId) return slots as CourtPlanSlot[];
  if (slot.courtId === courtId) return slots as CourtPlanSlot[];
  const other = courtId ? slots.findIndex((s, i) => i !== index && s.courtId === courtId) : -1;
  if (other >= 0 && slots[other].bookingId) return slots as CourtPlanSlot[];
  return slots.map((s, i) => {
    if (i === index) return { ...s, courtId };
    if (i === other) return { ...s, courtId: slot.courtId };
    return s;
  });
}

export type LinkedBookingRef = { id: string; courtId: string | null };

/**
 * Put exactly `bookings` on slots. Bookings no longer selected leave their
 * slot (the court stays); a new one lands on the slot with its court, else the
 * first free "Any court" slot, else the first unlinked slot, else a new slot.
 * A booking's court moves off any other unlinked slot that had it.
 */
export function syncLinkedBookings(
  slots: readonly CourtPlanSlot[],
  bookings: readonly LinkedBookingRef[],
): CourtPlanSlot[] {
  const wanted = new Set(bookings.map((b) => b.id));
  const next: CourtPlanSlot[] = slots.map((s) =>
    s.bookingId && !wanted.has(s.bookingId) ? { ...s, bookingId: null } : { ...s },
  );
  for (const booking of bookings) {
    if (next.some((s) => s.bookingId === booking.id)) continue;
    const free = (s: CourtPlanSlot) => !s.bookingId;
    let target = booking.courtId ? next.findIndex((s) => free(s) && s.courtId === booking.courtId) : -1;
    if (target < 0) target = next.findIndex((s) => free(s) && s.courtId == null);
    if (target < 0) target = next.findIndex(free);
    if (target < 0) {
      next.push(emptyCourtSlot());
      target = next.length - 1;
    }
    if (booking.courtId) {
      next.forEach((s, i) => {
        if (i !== target && !s.bookingId && s.courtId === booking.courtId) next[i] = { ...s, courtId: null };
      });
    }
    next[target] = { courtId: booking.courtId, bookingId: booking.id, reported: false };
  }
  return next;
}

export function clearLinkedBookings(slots: readonly CourtPlanSlot[]): CourtPlanSlot[] {
  return slots.some((s) => s.bookingId) ? slots.map((s) => ({ ...s, bookingId: null })) : (slots as CourtPlanSlot[]);
}

/** Set the "marked reserved" flag on every unlinked slot. */
export function setSlotsReported(slots: readonly CourtPlanSlot[], reported: boolean): CourtPlanSlot[] {
  return slots.some((s) => !s.bookingId && s.reported !== reported)
    ? slots.map((s) => (s.bookingId ? { ...s, reported: false } : { ...s, reported }))
    : (slots as CourtPlanSlot[]);
}

export function setSlotReported(slots: readonly CourtPlanSlot[], index: number, reported: boolean): CourtPlanSlot[] {
  const slot = slots[index];
  if (!slot || slot.bookingId || slot.reported === reported) return slots as CourtPlanSlot[];
  return slots.map((s, i) => (i === index ? { ...s, reported } : s));
}

export function isSlotReserved(slot: CourtPlanSlot): boolean {
  return Boolean(slot.bookingId) || slot.reported;
}

export function reservedSlotCount(slots: readonly CourtPlanSlot[]): number {
  return slots.filter(isSlotReserved).length;
}

/* ------------------------------------------------------------------ *
 * Primary button
 * ------------------------------------------------------------------ */

export type CourtPlanCta = { key: string; values?: Record<string, number> };

export function defaultCreateButtonKey(entityType: EntityType): string {
  switch (entityType) {
    case 'TOURNAMENT':
      return 'createGame.createButtonTournament';
    case 'LEAGUE':
      return 'createGame.createButtonLeague';
    case 'BAR':
      return 'createGame.createButtonBar';
    case 'TRAINING':
      return 'createGame.createButtonTraining';
    default:
      return 'createGame.createButton';
  }
}

/** What the primary button promises — the same wording for every game type. */
export function resolveCourtPlanCta(input: {
  entityType: EntityType;
  choice: AtClubChoice | null;
  slots: readonly CourtPlanSlot[];
}): CourtPlanCta {
  if (input.entityType === 'BAR' || input.choice == null) return { key: defaultCreateButtonKey(input.entityType) };
  if (input.choice === 'reserveNow') {
    return { key: 'createGame.courtPlan.cta.reserve', values: { count: Math.max(1, input.slots.length) } };
  }
  if (input.choice === 'alreadyReserved') {
    const reserved = reservedSlotCount(input.slots);
    if (reserved > 0) return { key: 'createGame.courtPlan.cta.withReserved', values: { count: reserved } };
  }
  return { key: defaultCreateButtonKey(input.entityType) };
}

/* ------------------------------------------------------------------ *
 * Occupancy
 * ------------------------------------------------------------------ */

export type CourtHardReason = 'club' | 'hold' | 'app_game_reserved';

export type CourtWindowState = {
  /** A block that makes this court unusable for the window, or null. */
  hard: CourtHardReason | null;
  /** Another planned app game uses the court (selectable, with a note). */
  soft: boolean;
};

const HARD_ORDER: CourtHardReason[] = ['hold', 'club', 'app_game_reserved'];

/** Every court's state over `[startMs, endMs)`. Courts without blocks are free. */
export function courtStatesForWindow(
  blocks: readonly OccupancyBlock[],
  courtIds: readonly string[],
  startMs: number,
  endMs: number,
): Map<string, CourtWindowState> {
  const states = new Map<string, CourtWindowState>(courtIds.map((id) => [id, { hard: null, soft: false }]));
  if (!(endMs > startMs)) return states;
  for (const block of blocks) {
    const state = states.get(block.courtId);
    if (!state) continue;
    const s = Date.parse(block.start);
    const e = Date.parse(block.end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || s >= endMs || e <= startMs) continue;
    if (block.kind === 'app_game_planned') {
      state.soft = true;
      continue;
    }
    const kind = block.kind as CourtHardReason;
    if (state.hard == null || HARD_ORDER.indexOf(kind) < HARD_ORDER.indexOf(state.hard)) state.hard = kind;
  }
  return states;
}

export type PlanTimeBlock =
  | { kind: 'hard'; reason: CourtHardReason; courtId: string }
  | { kind: 'hard'; reason: 'notEnoughCourts'; free: number; needed: number }
  | { kind: 'soft' };

/**
 * Can the plan's courts be used over the window described by `states`?
 *
 * Skipped: linked slots (the player's own reservation shows as club-busy) and,
 * when `trustReported`, slots marked reserved (same: their phone booking is
 * the club block). Picked courts must be free of hard blocks; "Any court"
 * slots need that many other courts free. A planned game on a court the plan
 * needs is only `soft`.
 */
export function resolvePlanTimeBlock(input: {
  slots: readonly CourtPlanSlot[];
  states: ReadonlyMap<string, CourtWindowState>;
  /** Courts an "Any court" slot may take (sport-compatible; bookable when reserving now). */
  poolCourtIds: readonly string[];
  trustReported: boolean;
}): PlanTimeBlock | null {
  const taken = new Set(assignedCourtIds(input.slots));
  const checked = input.slots.filter((s) => !s.bookingId && !(input.trustReported && s.reported));
  let soft = false;
  for (const slot of checked) {
    if (!slot.courtId) continue;
    const state = input.states.get(slot.courtId);
    if (!state) continue;
    if (state.hard) return { kind: 'hard', reason: state.hard, courtId: slot.courtId };
    if (state.soft) soft = true;
  }
  const needed = checked.filter((s) => !s.courtId).length;
  if (needed > 0) {
    const pool = input.poolCourtIds.filter((id) => !taken.has(id));
    const free = pool.filter((id) => !input.states.get(id)?.hard);
    if (free.length < needed) return { kind: 'hard', reason: 'notEnoughCourts', free: free.length, needed };
    const quiet = free.filter((id) => !input.states.get(id)?.soft);
    if (quiet.length < needed) soft = true;
  }
  return soft ? { kind: 'soft' } : null;
}

/**
 * Reserve now books real courts, so every "Any court" slot gets a concrete
 * court from `poolCourtIds`: free ones first, then ones with only a planned
 * game. `null` when there are not enough.
 */
export function fillAnyCourtSlots(
  slots: readonly CourtPlanSlot[],
  states: ReadonlyMap<string, CourtWindowState>,
  poolCourtIds: readonly string[],
): CourtPlanSlot[] | null {
  const taken = new Set(assignedCourtIds(slots));
  const usable = poolCourtIds.filter((id) => !taken.has(id) && !states.get(id)?.hard);
  const ordered = [...usable.filter((id) => !states.get(id)?.soft), ...usable.filter((id) => states.get(id)?.soft)];
  let cursor = 0;
  const next: CourtPlanSlot[] = [];
  for (const slot of slots) {
    if (slot.courtId || slot.bookingId) {
      next.push(slot);
      continue;
    }
    const courtId = ordered[cursor];
    if (!courtId) return null;
    cursor += 1;
    next.push({ ...slot, courtId });
  }
  return next;
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export type CourtPlanIssue =
  | 'authRequired'
  | 'timeRequired'
  | 'durationRequired'
  | 'timeBlocked'
  | 'courtNotBookable'
  | 'notEnoughBookableCourts'
  | 'reservationsLoading';

export type CourtPlanValidation = { ok: true } | { ok: false; reason: CourtPlanIssue };

export function validateCourtPlan(input: {
  choice: AtClubChoice | null;
  needsAuth: boolean;
  selectedTime: string;
  duration: number;
  timeBlock: PlanTimeBlock | null;
  slots: readonly CourtPlanSlot[];
  /** Courts the provider can book (Reserve now). */
  bookableCourtIds: ReadonlySet<string>;
  /** Reserve now: "Any court" slots could all be filled with bookable courts. */
  anyCourtsFillable: boolean;
  /** Linked ids whose reservation records have not loaded yet. */
  pendingReservationCount: number;
}): CourtPlanValidation {
  if (input.choice === 'reserveNow' && input.needsAuth) return { ok: false, reason: 'authRequired' };
  if (input.pendingReservationCount > 0) return { ok: false, reason: 'reservationsLoading' };
  if (!input.selectedTime) return { ok: false, reason: 'timeRequired' };
  if (!input.duration) return { ok: false, reason: 'durationRequired' };
  if (input.choice === 'reserveNow') {
    if (input.slots.some((s) => s.courtId && !s.bookingId && !input.bookableCourtIds.has(s.courtId))) {
      return { ok: false, reason: 'courtNotBookable' };
    }
    if (!input.anyCourtsFillable) return { ok: false, reason: 'notEnoughBookableCourts' };
  }
  if (input.timeBlock?.kind === 'hard') return { ok: false, reason: 'timeBlocked' };
  return { ok: true };
}

export function courtPlanIssueKey(reason: CourtPlanIssue): string {
  if (reason === 'authRequired') return 'createGame.booktime.signInToContinue';
  return `createGame.courtPlan.issue.${reason}`;
}

/* ------------------------------------------------------------------ *
 * Payload
 * ------------------------------------------------------------------ */

export type CreateCourtSlotsBody = {
  slots: Array<{ courtId: string; reservation: CourtSlotReservation }>;
  reportedAnyCourtCount: number;
  courtSlotCount: number;
};

/**
 * `PUT /games/:id/court-slots` body for the freshly created game: picked and
 * linked courts in slot order (marked ones `REPORTED`; links reserve on their
 * own), "Any court" slots marked reserved as `reportedAnyCourtCount`, and the
 * organizer's count.
 */
export function buildCreateCourtSlotsBody(slots: readonly CourtPlanSlot[]): CreateCourtSlotsBody {
  const body: CreateCourtSlotsBody['slots'] = [];
  for (const slot of slots) {
    if (!slot.courtId || body.some((s) => s.courtId === slot.courtId)) continue;
    body.push({ courtId: slot.courtId, reservation: slot.reported && !slot.bookingId ? 'REPORTED' : 'NONE' });
  }
  return {
    slots: body,
    reportedAnyCourtCount: slots.filter((s) => !s.courtId && !s.bookingId && s.reported).length,
    courtSlotCount: Math.min(MAX_COURT_SLOTS, Math.max(1, slots.length)),
  };
}

/** Old-app `hasBookedCourt` for the create payload: anything reserved. */
export function legacyHasBookedCourt(slots: readonly CourtPlanSlot[]): boolean {
  return slots.some(isSlotReserved);
}

/** Initial "At the club?" answer for a fresh draft. */
export function resolveInitialAtClubChoice(input: {
  canReserveNow: boolean;
  hasPreselectedBookings: boolean;
  initialHasBookedCourt: boolean;
  fromPlayIntent: boolean;
}): AtClubChoice {
  if (input.hasPreselectedBookings || input.initialHasBookedCourt) return 'alreadyReserved';
  if (input.fromPlayIntent) return 'notYet';
  return input.canReserveNow ? 'reserveNow' : 'notYet';
}
