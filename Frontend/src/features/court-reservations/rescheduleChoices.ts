/**
 * The organizer's per-court picks on top of a {@link ReschedulePlan}.
 *
 * `planReschedule` returns, per slot, the default option first plus the
 * alternatives. The sheet lets the organizer tap another option; this module
 * turns the plan + those picks into the effective step list (same global
 * order rules as the planner: phase, then slot order, then the option's own
 * order, de-duplicated by idempotency key) and decides what the footer says.
 *
 * Also: the one-tap clash fix ({@link clashFix}) and the nearest working time
 * ({@link findNearestWorkingWindow}).
 */
import {
  PLAN_STEP_PHASE,
  planReschedule,
  type PlanRescheduleInput,
  type PlanStep,
  type ReschedulePlan,
  type SlotPlan,
  type SlotPlanAction,
  type SlotPlanOption,
} from '@shared/gameBooking/planReschedule';
import { MINUTE_MS, parseInstantMs, type IsoInterval } from '@shared/gameBooking/coverageIntervals';

export type RescheduleChoices = Readonly<Record<string, SlotPlanAction | undefined>>;

export type EffectiveSlotPlan = {
  plan: SlotPlan;
  /** The option that will run; `null` when nothing is possible (clash). */
  chosen: SlotPlanOption | null;
  /** The organizer picked something other than the default. */
  overridden: boolean;
  /** Available options other than `chosen`, in planner order. */
  alternatives: SlotPlanOption[];
  /** Red row: the slot has a clash and no runnable option is chosen. */
  blocked: boolean;
};

export type FooterState =
  | { kind: 'no_changes' }
  | { kind: 'blocked'; blockedSlotKeys: string[] }
  | { kind: 'ready'; stepCount: number };

export type EffectiveReschedulePlan = {
  gameId: string;
  windowChanged: boolean;
  slots: EffectiveSlotPlan[];
  steps: PlanStep[];
  stepCount: number;
  footer: FooterState;
};

/** Steps the app runs itself (excludes "tell the club" follow-ups). */
export function isAutomaticStep(step: PlanStep): boolean {
  return step.kind !== 'manual_cancel' && step.kind !== 'manual_club';
}

function defaultOption(plan: SlotPlan): SlotPlanOption | null {
  if (plan.outcome === 'blocked') return null;
  return plan.options[0] ?? null;
}

export function applyRescheduleChoices(plan: ReschedulePlan, choices: RescheduleChoices): EffectiveReschedulePlan {
  const slots: EffectiveSlotPlan[] = plan.slots.map((slotPlan) => {
    const fallback = defaultOption(slotPlan);
    const picked = choices[slotPlan.slotKey];
    const pickedOption = picked
      ? slotPlan.options.find((o) => o.action === picked && o.available) ?? null
      : null;
    const chosen = pickedOption ?? fallback;
    return {
      plan: slotPlan,
      chosen,
      overridden: Boolean(pickedOption && pickedOption !== fallback),
      alternatives: slotPlan.options.filter((o) => o.available && o !== chosen),
      blocked: chosen == null,
    };
  });

  const save = plan.steps.find((s) => s.kind === 'save_game');
  const ordered: { step: PlanStep; slotOrder: number; index: number }[] = [];
  for (const s of slots) {
    (s.chosen?.steps ?? []).forEach((step, index) => ordered.push({ step, slotOrder: s.plan.order, index }));
  }
  if (save) ordered.push({ step: save, slotOrder: -1, index: 0 });
  ordered.sort(
    (a, b) =>
      PLAN_STEP_PHASE[a.step.kind] - PLAN_STEP_PHASE[b.step.kind] || a.slotOrder - b.slotOrder || a.index - b.index,
  );
  const seen = new Set<string>();
  const steps: PlanStep[] = [];
  for (const { step } of ordered) {
    if (seen.has(step.idempotencyKey)) continue;
    seen.add(step.idempotencyKey);
    steps.push(step);
  }

  const blockedSlotKeys = slots.filter((s) => s.blocked).map((s) => s.plan.slotKey);
  const footer: FooterState = !plan.windowChanged
    ? { kind: 'no_changes' }
    : blockedSlotKeys.length > 0
      ? { kind: 'blocked', blockedSlotKeys }
      : { kind: 'ready', stepCount: steps.length };

  return { gameId: plan.gameId, windowChanged: plan.windowChanged, slots, steps, stepCount: steps.length, footer };
}

export type ClashFix =
  | { kind: 'choose'; action: SlotPlanAction; option: SlotPlanOption }
  | { kind: 'move_time'; window: IsoInterval };

const FIX_PREFERENCE: SlotPlanAction[] = ['switch_court', 'extend', 'move', 'move_together', 'unlink', 'manual'];

/**
 * One tap that makes a blocked slot runnable: the most helpful available
 * option (another court before "ask the club"); otherwise the nearest time
 * where the whole plan works (`nearestWindow`, computed by the caller).
 */
export function clashFix(slot: EffectiveSlotPlan, nearestWindow: IsoInterval | null): ClashFix | null {
  if (!slot.blocked) return null;
  const available = slot.plan.options.filter((o) => o.available);
  for (const action of FIX_PREFERENCE) {
    const option = available.find((o) => o.action === action);
    if (option) return { kind: 'choose', action, option };
  }
  return nearestWindow ? { kind: 'move_time', window: nearestWindow } : null;
}

/**
 * The closest start (same length) within ±`maxShiftMinutes`, in
 * `stepMinutes` steps, where no slot is blocked. Ties prefer later times
 * (people rarely want to play earlier than planned). The current time is
 * never offered (that is "no change", not a fix). `null` when none.
 */
export function findNearestWorkingWindow(
  input: Omit<PlanRescheduleInput, 'newWindow'>,
  window: IsoInterval,
  options: { stepMinutes?: number; maxShiftMinutes?: number; within?: { startMs: number; endMs: number } } = {},
): IsoInterval | null {
  const step = (options.stepMinutes ?? 15) * MINUTE_MS;
  const maxShift = (options.maxShiftMinutes ?? 180) * MINUTE_MS;
  const start = parseInstantMs(window.start);
  const end = parseInstantMs(window.end);
  if (start == null || end == null || end <= start) return null;
  const currentStart = parseInstantMs(input.currentWindow.start);
  const currentEnd = parseInstantMs(input.currentWindow.end);
  for (let delta = step; delta <= maxShift; delta += step) {
    for (const sign of [1, -1]) {
      const s = start + sign * delta;
      const e = end + sign * delta;
      if (options.within && (s < options.within.startMs || e > options.within.endMs)) continue;
      if (s === currentStart && e === currentEnd) continue;
      const candidate = { start: new Date(s).toISOString(), end: new Date(e).toISOString() };
      const plan = planReschedule({ ...input, newWindow: candidate });
      if (!plan.blocking) return candidate;
    }
  }
  return null;
}

/** Keep only picks that still exist as available options in the new plan. */
export function pruneChoices(plan: ReschedulePlan, choices: RescheduleChoices): Record<string, SlotPlanAction> {
  const out: Record<string, SlotPlanAction> = {};
  for (const slot of plan.slots) {
    const picked = choices[slot.slotKey];
    if (picked && slot.options.some((o) => o.action === picked && o.available)) out[slot.slotKey] = picked;
  }
  return out;
}
