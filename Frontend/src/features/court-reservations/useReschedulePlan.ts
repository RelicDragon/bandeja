/**
 * Draft window + per-court picks → live plan for the reschedule sheet.
 *
 * Re-plans on every 15-minute snap (the planner is pure and cheap). Picks
 * that stop being possible at the new time are dropped, so the footer never
 * promises an option the plan no longer has.
 */
import { useCallback, useMemo, useState } from 'react';
import { MINUTE_MS, parseInstantMs, type IsoInterval } from '@shared/gameBooking/coverageIntervals';
import {
  planReschedule,
  type AlternativeCourt,
  type OccupancyBlock,
  type PlanRescheduleInput,
  type PlanRescheduleSlotInput,
  type SharedGameRef,
  type SlotPlanAction,
} from '@shared/gameBooking/planReschedule';
import type { ProviderCapabilityOverrides } from '@shared/gameBooking/providerCapabilities';
import {
  applyRescheduleChoices,
  clashFix,
  findNearestWorkingWindow,
  pruneChoices,
  type ClashFix,
  type EffectiveReschedulePlan,
} from './rescheduleChoices';
import type { TimelineRange } from './courtReservationsModel';

export const SNAP_MINUTES = 15;
export const MIN_LENGTH_MINUTES = 30;
export const MAX_LENGTH_MINUTES = 6 * 60;

export type ReschedulePlanSource = {
  gameId: string;
  currentWindow: IsoInterval;
  slots: readonly PlanRescheduleSlotInput[];
  occupancy?: readonly OccupancyBlock[];
  sharedWith?: Readonly<Record<string, readonly SharedGameRef[] | undefined>>;
  alternativeCourts?: readonly AlternativeCourt[];
  providerCapabilities?: ProviderCapabilityOverrides;
};

export type DraftWindow = { startMs: number; endMs: number };

export function snapMs(ms: number, minutes = SNAP_MINUTES): number {
  const step = minutes * MINUTE_MS;
  return Math.round(ms / step) * step;
}

/** Clamp a moved/resized window into `bounds`, keeping its length when it fits. */
export function clampDraft(draft: DraftWindow, bounds: TimelineRange | null): DraftWindow {
  const length = Math.min(
    Math.max(draft.endMs - draft.startMs, MIN_LENGTH_MINUTES * MINUTE_MS),
    MAX_LENGTH_MINUTES * MINUTE_MS,
  );
  let startMs = draft.startMs;
  if (bounds) {
    startMs = Math.max(bounds.startMs, Math.min(startMs, bounds.endMs - length));
  }
  return { startMs, endMs: startMs + length };
}

export function draftToIso(draft: DraftWindow): IsoInterval {
  return { start: new Date(draft.startMs).toISOString(), end: new Date(draft.endMs).toISOString() };
}

export function useReschedulePlan(source: ReschedulePlanSource, bounds: TimelineRange | null) {
  const initial = useMemo<DraftWindow>(() => {
    const s = parseInstantMs(source.currentWindow.start) ?? 0;
    const e = parseInstantMs(source.currentWindow.end) ?? s + 90 * MINUTE_MS;
    return { startMs: s, endMs: e };
  }, [source.currentWindow.start, source.currentWindow.end]);

  const [draft, setDraftState] = useState<DraftWindow>(initial);
  const [rawChoices, setRawChoices] = useState<Record<string, SlotPlanAction>>({});

  const input = useMemo<Omit<PlanRescheduleInput, 'newWindow'>>(
    () => ({
      gameId: source.gameId,
      currentWindow: source.currentWindow,
      slots: source.slots,
      occupancy: source.occupancy,
      sharedWith: source.sharedWith,
      freeAlternativeCourts: source.alternativeCourts,
      providerCapabilities: source.providerCapabilities,
    }),
    [source],
  );

  const newWindow = useMemo(() => draftToIso(draft), [draft]);
  const plan = useMemo(() => planReschedule({ ...input, newWindow }), [input, newWindow]);
  const choices = useMemo(() => pruneChoices(plan, rawChoices), [plan, rawChoices]);
  const effective: EffectiveReschedulePlan = useMemo(() => applyRescheduleChoices(plan, choices), [plan, choices]);

  const nearestWindow = useMemo(
    () =>
      effective.footer.kind === 'blocked'
        ? findNearestWorkingWindow(input, newWindow, { within: bounds ?? undefined })
        : null,
    [effective.footer.kind, input, newWindow, bounds],
  );

  const fixes = useMemo(() => {
    const out: Record<string, ClashFix | null> = {};
    for (const slot of effective.slots) out[slot.plan.slotKey] = clashFix(slot, nearestWindow);
    return out;
  }, [effective.slots, nearestWindow]);

  const setDraft = useCallback(
    (next: DraftWindow) => setDraftState(clampDraft({ startMs: snapMs(next.startMs), endMs: snapMs(next.endMs) }, bounds)),
    [bounds],
  );
  const shiftStart = useCallback(
    (minutes: number) =>
      setDraftState((d) => clampDraft({ startMs: d.startMs + minutes * MINUTE_MS, endMs: d.endMs + minutes * MINUTE_MS }, bounds)),
    [bounds],
  );
  const changeLength = useCallback(
    (minutes: number) => setDraftState((d) => clampDraft({ startMs: d.startMs, endMs: d.endMs + minutes * MINUTE_MS }, bounds)),
    [bounds],
  );
  const choose = useCallback((slotKey: string, action: SlotPlanAction) => {
    setRawChoices((prev) => ({ ...prev, [slotKey]: action }));
  }, []);
  const applyFix = useCallback(
    (slotKey: string, fix: ClashFix) => {
      if (fix.kind === 'choose') choose(slotKey, fix.action);
      else {
        const s = parseInstantMs(fix.window.start);
        const e = parseInstantMs(fix.window.end);
        if (s != null && e != null) setDraftState(clampDraft({ startMs: s, endMs: e }, bounds));
      }
    },
    [bounds, choose],
  );
  const reset = useCallback(() => {
    setDraftState(initial);
    setRawChoices({});
  }, [initial]);

  return { draft, newWindow, plan, effective, fixes, setDraft, shiftStart, changeLength, choose, applyFix, reset };
}

export type ReschedulePlanState = ReturnType<typeof useReschedulePlan>;
