/**
 * Reschedule planner — what happens to each court slot when a game's time
 * moves, as an ordered, idempotent list of steps.
 *
 * Pure: the caller supplies the slots ({@link deriveCourtReservations}),
 * who else uses each linked reservation, the court occupancy (without this
 * game's own blocks), free alternative courts and provider capabilities.
 *
 * Rules:
 *  - New window still covered by the slot's reservation → `keep` (report unused minutes).
 *  - Unshared link, not covering → `move` (book new window, then cancel the
 *    old one — via API when the provider can cancel, otherwise a manual
 *    "cancel with the club" step). If the new booking would overlap the old
 *    one on the same court (a small shift), providers reject it, so the
 *    default becomes `extend` (book only the uncovered gaps).
 *  - Shared link (other games use the same reservation) → never cancelled.
 *    Default `extend`; alternatives `unlink` and, when every sharer is
 *    editable, `move_together`.
 *  - Gaps are rounded UP to the provider's bookable lengths (min 60 minutes),
 *    extending away from the existing booking; if that rounding hits a hard
 *    block, the other direction is tried, else the option is unavailable.
 *  - Planned slot → clash check only. Reported slot → `keep` if the new window
 *    sits inside the old one, otherwise `manual` ("tell the club").
 *  - A hard block (club / hold / reserved app game) on the default action →
 *    `switch_court` to the first free alternative court (one without a
 *    planned app game at that time preferred), else `blocked`.
 *    A planned app game only produces a soft warning.
 *
 * Global step order: every booking, then court reassignment, then
 * `save_game`, then unlink / shared-game moves, then cancellations and
 * club-contact steps.
 */
import {
  computeCoverageGapsMs,
  coveredLengthMs,
  intervalsOverlap,
  mergeIntervals,
  MINUTE_MS,
  msToMinutes,
  toMsInterval,
  totalLengthMs,
  type IsoInterval,
  type MsInterval,
} from './coverageIntervals';
import type { CourtSlotLink, CourtSlotState, CourtSlotView } from './courtReservations';
import {
  planBookingDurations,
  resolveProviderCapabilities,
  type ProviderCapabilities,
  type ProviderCapabilityOverrides,
} from './providerCapabilities';

export type RescheduleWindow = IsoInterval;

export type SharedGameRef = {
  gameId: string;
  name: string;
  start: string;
  end: string;
  canEdit: boolean;
};

export type OccupancyBlockKind = 'club' | 'hold' | 'app_game_reserved' | 'app_game_planned';

export type OccupancyBlock = {
  courtId: string;
  start: string;
  end: string;
  kind: OccupancyBlockKind;
  gameId?: string | null;
  label?: string | null;
};

export type AlternativeCourt = { courtId: string; name: string };

export type PlanRescheduleSlotInput = Pick<
  CourtSlotView,
  'key' | 'order' | 'courtId' | 'gameCourtId' | 'effectiveCourtId' | 'state' | 'links' | 'provider' | 'unknownTime'
>;

export type PlanRescheduleInput = {
  gameId: string;
  currentWindow: RescheduleWindow;
  newWindow: RescheduleWindow;
  slots: readonly PlanRescheduleSlotInput[];
  /** Other games using the same reservation, keyed by link id or externalBookingId. */
  sharedWith?: Readonly<Record<string, readonly SharedGameRef[] | undefined>>;
  /** Court occupancy around the new window, excluding this game's own blocks. */
  occupancy?: readonly OccupancyBlock[];
  /** Courts the caller considers free for the new window, in preference order. */
  freeAlternativeCourts?: readonly AlternativeCourt[];
  /** Merged over {@link DEFAULT_PROVIDER_CAPABILITIES}. */
  providerCapabilities?: ProviderCapabilityOverrides;
};

export type SlotOutcome = 'unchanged' | 'keep' | 'move' | 'extend' | 'switch_court' | 'blocked' | 'manual';

export type SlotPlanAction =
  | 'none'
  | 'keep'
  | 'move'
  | 'extend'
  | 'switch_court'
  | 'unlink'
  | 'move_together'
  | 'manual';

export type ManualClubReason = 'reported' | 'cannot_book' | 'no_court' | 'unknown_time' | 'user_choice';

type StepBase = { idempotencyKey: string };

export type BookStep = StepBase & {
  kind: 'book';
  slotKey: string;
  courtId: string;
  provider: string;
  start: string;
  end: string;
  purpose: 'move' | 'extend' | 'switch_court' | 'move_together';
  /** Minutes booked beyond what the game needs (provider rounding). */
  extraMinutes: number;
  /** Provider is not idempotent: list the user's bookings before any retry. */
  requiresVerifyBeforeRetry: boolean;
};

export type ReassignCourtStep = StepBase & {
  kind: 'reassign_court';
  slotKey: string;
  gameCourtId: string | null;
  fromCourtId: string | null;
  toCourtId: string;
};

export type SaveGameStep = StepBase & { kind: 'save_game'; start: string; end: string };

export type UnlinkStep = StepBase & {
  kind: 'unlink';
  slotKey: string;
  linkId: string;
  externalBookingId: string;
};

export type MoveSharedGameStep = StepBase & {
  kind: 'move_shared_game';
  slotKey: string;
  gameId: string;
  name: string;
  start: string;
  end: string;
};

export type CancelStep = StepBase & {
  kind: 'cancel' | 'manual_cancel';
  slotKey: string;
  linkId: string;
  externalBookingId: string;
  provider: string;
};

export type ManualClubStep = StepBase & {
  kind: 'manual_club';
  slotKey: string;
  courtId: string | null;
  provider: string | null;
  linkIds: string[];
  reason: ManualClubReason;
  /** The interval to ask the club for. */
  start: string;
  end: string;
};

export type PlanStep =
  | BookStep
  | ReassignCourtStep
  | SaveGameStep
  | UnlinkStep
  | MoveSharedGameStep
  | CancelStep
  | ManualClubStep;

export type PlanStepKind = PlanStep['kind'];

export const PLAN_STEP_PHASE: Readonly<Record<PlanStepKind, number>> = {
  book: 0,
  reassign_court: 1,
  save_game: 2,
  unlink: 3,
  move_shared_game: 3,
  cancel: 4,
  manual_cancel: 4,
  manual_club: 4,
};

export type SlotClash = {
  courtId: string;
  /** `window`: the game time itself is taken; `rounding`: only the rounded-up part. */
  cause: 'window' | 'rounding';
  blocks: OccupancyBlock[];
};

export type OptionUnavailableReason =
  | 'cannot_book'
  | 'no_court'
  | 'clash'
  | 'self_overlap'
  | 'duration_unavailable'
  | 'sharer_not_editable'
  | 'shared_time_unknown';

export type SlotPlanOption = {
  action: SlotPlanAction;
  available: boolean;
  unavailableReason?: OptionUnavailableReason;
  steps: PlanStep[];
  clash?: SlotClash;
  extraMinutes?: number;
  unusedMinutes?: number;
  toCourt?: AlternativeCourt;
  movesGames?: { gameId: string; name: string }[];
};

export type SlotPlanNote =
  | 'window_unchanged'
  | 'invalid_window'
  | 'still_covered'
  | 'tell_the_club'
  | 'shared_never_cancelled'
  | 'provider_cannot_book'
  | 'provider_cannot_cancel'
  | 'no_court'
  | 'unknown_time'
  | 'self_overlap_prefers_extend'
  | 'rounded_up'
  | 'rounding_flipped'
  | 'clash'
  | 'no_alternative_court'
  | 'soft_conflict';

export type SlotPlan = {
  slotKey: string;
  order: number;
  state: CourtSlotState;
  outcome: SlotOutcome;
  /** Default first. Unavailable options are included so the UI can explain them. */
  options: SlotPlanOption[];
  /** Steps of the default option (empty when blocked). */
  steps: PlanStep[];
  clash?: SlotClash;
  /** Planned app games overlapping the new window on the slot's court. */
  warnings: OccupancyBlock[];
  unusedMinutes?: number;
  extraMinutes?: number;
  notes: SlotPlanNote[];
};

export type ReschedulePlan = {
  gameId: string;
  windowChanged: boolean;
  slots: SlotPlan[];
  steps: PlanStep[];
  stepCount: number;
  blocking: boolean;
  summaryCounts: Record<SlotOutcome, number>;
};

const HARD_KINDS: ReadonlySet<OccupancyBlockKind> = new Set(['club', 'hold', 'app_game_reserved']);

type ParsedBlock = { block: OccupancyBlock; ms: MsInterval; hard: boolean };

type Ctx = {
  gameId: string;
  current: MsInterval;
  next: MsInterval;
  blocks: ParsedBlock[];
  overrides?: ProviderCapabilityOverrides;
  sharedWith: Readonly<Record<string, readonly SharedGameRef[] | undefined>>;
  alternatives: readonly AlternativeCourt[];
  takenCourts: Set<string>;
};

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function intervalKey(i: MsInterval): string {
  return `${i.start}-${i.end}`;
}

function stepKey(gameId: string, slotKey: string, action: string, detail: string): string {
  return `reschedule:${gameId}:${slotKey}:${action}:${detail}`;
}

function compareBlocks(a: ParsedBlock, b: ParsedBlock): number {
  return (
    a.ms.start - b.ms.start ||
    a.ms.end - b.ms.end ||
    (a.block.courtId < b.block.courtId ? -1 : a.block.courtId > b.block.courtId ? 1 : 0) ||
    (a.block.kind < b.block.kind ? -1 : a.block.kind > b.block.kind ? 1 : 0) ||
    ((a.block.gameId ?? '') < (b.block.gameId ?? '') ? -1 : (a.block.gameId ?? '') > (b.block.gameId ?? '') ? 1 : 0)
  );
}

function blocksOverlapping(ctx: Ctx, courtId: string, interval: MsInterval, hard: boolean): OccupancyBlock[] {
  return ctx.blocks
    .filter((b) => b.hard === hard && b.block.courtId === courtId && intervalsOverlap(b.ms, interval))
    .map((b) => b.block);
}

function linkMs(link: CourtSlotLink): MsInterval | null {
  if (link.startMs != null && link.endMs != null && link.endMs > link.startMs) {
    return { start: link.startMs, end: link.endMs };
  }
  return toMsInterval({ start: link.bookingStart, end: link.bookingEnd });
}

function sharersOf(ctx: Ctx, slot: PlanRescheduleSlotInput): SharedGameRef[] {
  const byGame = new Map<string, SharedGameRef>();
  for (const link of slot.links) {
    const refs = ctx.sharedWith[link.id] ?? ctx.sharedWith[link.externalBookingId] ?? [];
    for (const ref of refs) if (!byGame.has(ref.gameId)) byGame.set(ref.gameId, ref);
  }
  return [...byGame.values()].sort((a, b) => (a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0));
}

type CoverAttempt =
  | { ok: true; intervals: MsInterval[]; extraMinutes: number; flipped: boolean }
  | { ok: false; reason: 'clash' | 'self_overlap' | 'duration_unavailable'; clash?: SlotClash };

/**
 * Book `target` on `courtId` in provider-sized pieces. Pieces are laid from
 * `prefer` (`start` = grow later, `end` = grow earlier); if the rounded part
 * hits a hard block or one of `own` bookings, the other direction is tried.
 */
function coverWithBookings(
  ctx: Ctx,
  target: MsInterval,
  courtId: string,
  caps: ProviderCapabilities,
  own: readonly MsInterval[],
  prefer: 'start' | 'end',
): CoverAttempt {
  const windowHard = blocksOverlapping(ctx, courtId, target, true);
  if (windowHard.length > 0) {
    return { ok: false, reason: 'clash', clash: { courtId, cause: 'window', blocks: windowHard } };
  }
  if (own.some((o) => intervalsOverlap(o, target))) return { ok: false, reason: 'self_overlap' };
  const neededMinutes = Math.ceil((target.end - target.start) / MINUTE_MS);
  const durations = planBookingDurations(neededMinutes, caps);
  if (!durations) return { ok: false, reason: 'duration_unavailable' };
  const totalMinutes = durations.reduce((s, d) => s + d, 0);
  const extraMinutes = totalMinutes - neededMinutes;

  const lay = (anchor: 'start' | 'end'): MsInterval[] => {
    const out: MsInterval[] = [];
    if (anchor === 'start') {
      let cursor = target.start;
      for (const d of durations) {
        out.push({ start: cursor, end: cursor + d * MINUTE_MS });
        cursor += d * MINUTE_MS;
      }
    } else {
      let cursor = target.end;
      for (const d of [...durations].reverse()) {
        out.unshift({ start: cursor - d * MINUTE_MS, end: cursor });
        cursor -= d * MINUTE_MS;
      }
    }
    return out;
  };

  const anchors: ('start' | 'end')[] = extraMinutes > 0 ? [prefer, prefer === 'start' ? 'end' : 'start'] : [prefer];
  const hardSeen: ParsedBlock[] = [];
  let ownHit = false;
  for (const [index, anchor] of anchors.entries()) {
    const intervals = lay(anchor);
    const hull = { start: intervals[0].start, end: intervals[intervals.length - 1].end };
    const hard = ctx.blocks.filter((b) => b.hard && b.block.courtId === courtId && intervalsOverlap(b.ms, hull));
    const ownOverlap = own.some((o) => intervalsOverlap(o, hull));
    if (hard.length === 0 && !ownOverlap) {
      return { ok: true, intervals, extraMinutes, flipped: index > 0 };
    }
    for (const h of hard) if (!hardSeen.includes(h)) hardSeen.push(h);
    ownHit = ownHit || ownOverlap;
  }
  if (hardSeen.length > 0) {
    return {
      ok: false,
      reason: 'clash',
      clash: { courtId, cause: 'rounding', blocks: [...hardSeen].sort(compareBlocks).map((b) => b.block) },
    };
  }
  return { ok: false, reason: ownHit ? 'self_overlap' : 'duration_unavailable' };
}

function bookSteps(
  ctx: Ctx,
  slotKey: string,
  courtId: string,
  provider: string,
  caps: ProviderCapabilities,
  purpose: BookStep['purpose'],
  intervals: readonly MsInterval[],
  needed: readonly MsInterval[],
): BookStep[] {
  return intervals.map((interval) => {
    const neededMs = needed.reduce((sum, n) => {
      const s = Math.max(n.start, interval.start);
      const e = Math.min(n.end, interval.end);
      return e > s ? sum + (e - s) : sum;
    }, 0);
    return {
      kind: 'book',
      idempotencyKey: stepKey(ctx.gameId, slotKey, `book_${purpose}`, `${courtId}:${intervalKey(interval)}`),
      slotKey,
      courtId,
      provider,
      start: iso(interval.start),
      end: iso(interval.end),
      purpose,
      extraMinutes: msToMinutes(interval.end - interval.start - neededMs),
      requiresVerifyBeforeRetry: !caps.idempotent,
    };
  });
}

function cancelSteps(ctx: Ctx, slot: PlanRescheduleSlotInput, links: readonly CourtSlotLink[]): CancelStep[] {
  return links.map((link) => {
    const caps = resolveProviderCapabilities(link.provider, ctx.overrides);
    const kind = caps?.canCancel ? 'cancel' : 'manual_cancel';
    return {
      kind,
      idempotencyKey: stepKey(ctx.gameId, slot.key, kind, link.id),
      slotKey: slot.key,
      linkId: link.id,
      externalBookingId: link.externalBookingId,
      provider: link.provider,
    };
  });
}

function unlinkSteps(ctx: Ctx, slot: PlanRescheduleSlotInput): UnlinkStep[] {
  return slot.links.map((link) => ({
    kind: 'unlink',
    idempotencyKey: stepKey(ctx.gameId, slot.key, 'unlink', link.id),
    slotKey: slot.key,
    linkId: link.id,
    externalBookingId: link.externalBookingId,
  }));
}

function manualOption(ctx: Ctx, slot: PlanRescheduleSlotInput, reason: ManualClubReason): SlotPlanOption {
  return {
    action: 'manual',
    available: true,
    steps: [
      {
        kind: 'manual_club',
        idempotencyKey: stepKey(ctx.gameId, slot.key, 'manual_club', `${reason}:${intervalKey(ctx.next)}`),
        slotKey: slot.key,
        courtId: slot.effectiveCourtId,
        provider: slot.provider,
        linkIds: slot.links.map((l) => l.id),
        reason,
        start: iso(ctx.next.start),
        end: iso(ctx.next.end),
      },
    ],
  };
}

function reassignStep(ctx: Ctx, slot: PlanRescheduleSlotInput, to: AlternativeCourt): ReassignCourtStep {
  return {
    kind: 'reassign_court',
    idempotencyKey: stepKey(ctx.gameId, slot.key, 'reassign_court', to.courtId),
    slotKey: slot.key,
    gameCourtId: slot.gameCourtId,
    fromCourtId: slot.effectiveCourtId,
    toCourtId: to.courtId,
  };
}

/**
 * First free alternative court whose new window is bookable; reserves it.
 * Courts without even a planned app game at that time come first, so the
 * game does not trade a hard clash for a soft one when a clean court exists.
 */
function switchCourtOption(
  ctx: Ctx,
  slot: PlanRescheduleSlotInput,
  booking: { caps: ProviderCapabilities; provider: string; shared: boolean } | null,
): SlotPlanOption | null {
  const softBusy = (courtId: string) => blocksOverlapping(ctx, courtId, ctx.next, false).length > 0;
  const ordered = [
    ...ctx.alternatives.filter((alt) => !softBusy(alt.courtId)),
    ...ctx.alternatives.filter((alt) => softBusy(alt.courtId)),
  ];
  for (const alt of ordered) {
    if (alt.courtId === slot.effectiveCourtId || ctx.takenCourts.has(alt.courtId)) continue;
    if (!booking) {
      if (blocksOverlapping(ctx, alt.courtId, ctx.next, true).length > 0) continue;
      ctx.takenCourts.add(alt.courtId);
      return { action: 'switch_court', available: true, toCourt: alt, steps: [reassignStep(ctx, slot, alt)] };
    }
    const attempt = coverWithBookings(ctx, ctx.next, alt.courtId, booking.caps, [], 'start');
    if (!attempt.ok) continue;
    ctx.takenCourts.add(alt.courtId);
    const release = booking.shared ? unlinkSteps(ctx, slot) : cancelSteps(ctx, slot, slot.links);
    return {
      action: 'switch_court',
      available: true,
      toCourt: alt,
      extraMinutes: attempt.extraMinutes,
      steps: [
        ...bookSteps(ctx, slot.key, alt.courtId, booking.provider, booking.caps, 'switch_court', attempt.intervals, [ctx.next]),
        reassignStep(ctx, slot, alt),
        ...release,
      ],
    };
  }
  return null;
}

function unavailable(action: SlotPlanAction, reason: OptionUnavailableReason, clash?: SlotClash): SlotPlanOption {
  return { action, available: false, unavailableReason: reason, steps: [], ...(clash ? { clash } : {}) };
}

function attemptFailure(action: SlotPlanAction, attempt: Extract<CoverAttempt, { ok: false }>): SlotPlanOption {
  return unavailable(action, attempt.reason, attempt.clash);
}

/** Book the parts of `target` that `existing` does not cover, growing away from existing bookings. */
function coverGaps(
  ctx: Ctx,
  target: MsInterval,
  existing: readonly MsInterval[],
  courtId: string,
  caps: ProviderCapabilities,
): { ok: true; intervals: MsInterval[]; gaps: MsInterval[]; extraMinutes: number; flipped: boolean } | Extract<CoverAttempt, { ok: false }> {
  const gaps = computeCoverageGapsMs(target, existing);
  const own: MsInterval[] = [...existing];
  const intervals: MsInterval[] = [];
  let extraMinutes = 0;
  let flipped = false;
  for (const gap of gaps) {
    const prefer: 'start' | 'end' = existing.some((e) => e.end === gap.start)
      ? 'start'
      : existing.some((e) => e.start === gap.end)
        ? 'end'
        : 'start';
    const attempt = coverWithBookings(ctx, gap, courtId, caps, own, prefer);
    if (!attempt.ok) return attempt;
    intervals.push(...attempt.intervals);
    own.push(...attempt.intervals);
    extraMinutes += attempt.extraMinutes;
    flipped = flipped || attempt.flipped;
  }
  return { ok: true, intervals, gaps, extraMinutes, flipped };
}

function finalize(
  ctx: Ctx,
  slot: PlanRescheduleSlotInput,
  outcome: SlotOutcome,
  options: SlotPlanOption[],
  notes: SlotPlanNote[],
  extra: Partial<Pick<SlotPlan, 'clash' | 'unusedMinutes' | 'extraMinutes'>> = {},
): SlotPlan {
  const defaultOption = outcome === 'blocked' ? undefined : options[0];
  const court = defaultOption?.toCourt?.courtId ?? slot.effectiveCourtId;
  const warnings = court ? blocksOverlapping(ctx, court, ctx.next, false) : [];
  const allNotes = [...notes];
  if (warnings.length > 0) allNotes.push('soft_conflict');
  return {
    slotKey: slot.key,
    order: slot.order,
    state: slot.state,
    outcome,
    options,
    steps: defaultOption ? defaultOption.steps : [],
    warnings,
    notes: [...new Set(allNotes)],
    ...(extra.clash ? { clash: extra.clash } : {}),
    ...(extra.unusedMinutes != null ? { unusedMinutes: extra.unusedMinutes } : {}),
    ...(extra.extraMinutes ? { extraMinutes: extra.extraMinutes } : {}),
  };
}

const ACTION_ORDER: SlotPlanAction[] = ['move', 'extend', 'move_together', 'unlink', 'switch_court', 'manual'];

function orderOptions(defaultOption: SlotPlanOption | null, others: (SlotPlanOption | null)[]): SlotPlanOption[] {
  const rest = others
    .filter((o): o is SlotPlanOption => o != null && o !== defaultOption)
    .sort((a, b) => ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action));
  return defaultOption ? [defaultOption, ...rest] : rest;
}

function outcomeFor(action: SlotPlanAction): SlotOutcome {
  switch (action) {
    case 'none':
      return 'unchanged';
    case 'keep':
    case 'move':
    case 'extend':
    case 'switch_court':
    case 'manual':
      return action;
    default:
      return 'manual';
  }
}

function planPlanned(ctx: Ctx, slot: PlanRescheduleSlotInput): SlotPlan {
  const court = slot.effectiveCourtId;
  const hard = court ? blocksOverlapping(ctx, court, ctx.next, true) : [];
  if (!court || hard.length === 0) {
    return finalize(ctx, slot, 'unchanged', [{ action: 'none', available: true, steps: [] }], []);
  }
  const clash: SlotClash = { courtId: court, cause: 'window', blocks: hard };
  const switchOpt = switchCourtOption(ctx, slot, null);
  if (switchOpt) return finalize(ctx, slot, 'switch_court', [switchOpt], ['clash'], { clash });
  return finalize(ctx, slot, 'blocked', [], ['clash', 'no_alternative_court'], { clash });
}

function planReported(ctx: Ctx, slot: PlanRescheduleSlotInput): SlotPlan {
  if (ctx.next.start >= ctx.current.start && ctx.next.end <= ctx.current.end) {
    const unusedMinutes = msToMinutes(ctx.current.end - ctx.current.start - (ctx.next.end - ctx.next.start));
    return finalize(ctx, slot, 'keep', [{ action: 'keep', available: true, steps: [], unusedMinutes }], ['still_covered'], {
      unusedMinutes,
    });
  }
  const court = slot.effectiveCourtId;
  const hard = court ? blocksOverlapping(ctx, court, ctx.next, true) : [];
  const clash = court && hard.length > 0 ? { courtId: court, cause: 'window' as const, blocks: hard } : undefined;
  return finalize(ctx, slot, 'manual', [manualOption(ctx, slot, 'reported')], clash ? ['tell_the_club', 'clash'] : ['tell_the_club'], {
    clash,
  });
}

function planLinked(ctx: Ctx, slot: PlanRescheduleSlotInput): SlotPlan {
  const own = mergeIntervals(slot.links.map(linkMs).filter((i): i is MsInterval => i != null));
  const gaps = computeCoverageGapsMs(ctx.next, own);
  const unusedMinutes = msToMinutes(totalLengthMs(own) - coveredLengthMs(ctx.next, own));

  if (gaps.length === 0) {
    return finalize(ctx, slot, 'keep', [{ action: 'keep', available: true, steps: [], unusedMinutes }], ['still_covered'], {
      unusedMinutes,
    });
  }
  if (slot.unknownTime) {
    return finalize(ctx, slot, 'manual', [manualOption(ctx, slot, 'unknown_time')], ['unknown_time', 'tell_the_club']);
  }

  const notes: SlotPlanNote[] = [];
  const court = slot.effectiveCourtId;
  const provider = slot.provider;
  const caps = resolveProviderCapabilities(provider, ctx.overrides);
  const sharers = sharersOf(ctx, slot);
  const shared = sharers.length > 0;
  if (shared) notes.push('shared_never_cancelled');
  if (slot.links.some((l) => !resolveProviderCapabilities(l.provider, ctx.overrides)?.canCancel) && !shared) {
    notes.push('provider_cannot_cancel');
  }

  if (!court || !caps || !caps.canBook || !provider) {
    const reason: ManualClubReason = !court ? 'no_court' : 'cannot_book';
    notes.push(!court ? 'no_court' : 'provider_cannot_book', 'tell_the_club');
    const manual = manualOption(ctx, slot, reason);
    const others = shared ? [{ action: 'unlink' as const, available: true, steps: unlinkSteps(ctx, slot) }] : [];
    return finalize(ctx, slot, 'manual', orderOptions(manual, others), notes);
  }

  // extend: book only the gaps of the new window.
  const extendAttempt = coverGaps(ctx, ctx.next, own, court, caps);
  const extendOpt: SlotPlanOption = extendAttempt.ok
    ? {
        action: 'extend',
        available: true,
        steps: bookSteps(ctx, slot.key, court, provider, caps, 'extend', extendAttempt.intervals, extendAttempt.gaps),
        extraMinutes: extendAttempt.extraMinutes,
        unusedMinutes,
      }
    : attemptFailure('extend', extendAttempt);

  let moveOpt: SlotPlanOption | null = null;
  let moveTogetherOpt: SlotPlanOption | null = null;
  let unlinkOpt: SlotPlanOption | null = null;

  if (!shared) {
    const moveAttempt = coverWithBookings(ctx, ctx.next, court, caps, own, 'start');
    moveOpt = moveAttempt.ok
      ? {
          action: 'move',
          available: true,
          extraMinutes: moveAttempt.extraMinutes,
          steps: [
            ...bookSteps(ctx, slot.key, court, provider, caps, 'move', moveAttempt.intervals, [ctx.next]),
            ...cancelSteps(ctx, slot, slot.links),
          ],
        }
      : attemptFailure('move', moveAttempt);
    if (!moveAttempt.ok && moveAttempt.reason === 'self_overlap') notes.push('self_overlap_prefers_extend');
  } else {
    unlinkOpt = { action: 'unlink', available: true, steps: unlinkSteps(ctx, slot) };
    moveTogetherOpt = planMoveTogether(ctx, slot, sharers, own, court, provider, caps);
  }

  const preferred = shared ? [extendOpt] : [moveOpt, extendOpt];
  const chosen = preferred.find((o): o is SlotPlanOption => o != null && o.available) ?? null;
  const primaryFailure = preferred.find((o) => o != null && o.clash)?.clash;

  if (chosen) {
    if (chosen.extraMinutes) notes.push('rounded_up');
    if (chosen.action === 'extend' && extendAttempt.ok && extendAttempt.flipped) notes.push('rounding_flipped');
    return finalize(
      ctx,
      slot,
      outcomeFor(chosen.action),
      orderOptions(chosen, [moveOpt, extendOpt, moveTogetherOpt, unlinkOpt, manualOption(ctx, slot, 'user_choice')]),
      notes,
      { unusedMinutes: chosen.action === 'extend' ? unusedMinutes : undefined, extraMinutes: chosen.extraMinutes },
    );
  }

  // The default action is not possible on this court.
  if (primaryFailure) notes.push('clash');
  const switchOpt = switchCourtOption(ctx, slot, { caps, provider, shared });
  const others = [moveOpt, extendOpt, moveTogetherOpt, unlinkOpt, manualOption(ctx, slot, 'user_choice')];
  if (switchOpt) {
    if (switchOpt.extraMinutes) notes.push('rounded_up');
    return finalize(ctx, slot, 'switch_court', orderOptions(switchOpt, others), notes, {
      clash: primaryFailure,
      extraMinutes: switchOpt.extraMinutes,
    });
  }
  notes.push('no_alternative_court');
  return finalize(ctx, slot, 'blocked', orderOptions(null, others), notes, { clash: primaryFailure });
}

/**
 * Shift every sharing game by the same delta; the reservation follows: book
 * whatever the shifted span (plus this game's new window) is missing, cancel
 * links that no longer touch it.
 */
function planMoveTogether(
  ctx: Ctx,
  slot: PlanRescheduleSlotInput,
  sharers: readonly SharedGameRef[],
  own: readonly MsInterval[],
  court: string,
  provider: string,
  caps: ProviderCapabilities,
): SlotPlanOption {
  const movesGames = sharers.map((s) => ({ gameId: s.gameId, name: s.name }));
  if (sharers.some((s) => !s.canEdit)) return { ...unavailable('move_together', 'sharer_not_editable'), movesGames };
  if (own.length === 0) return { ...unavailable('move_together', 'shared_time_unknown'), movesGames };
  const delta = ctx.next.start - ctx.current.start;
  const shiftedSharers: { ref: SharedGameRef; ms: MsInterval }[] = [];
  for (const ref of sharers) {
    const ms = toMsInterval(ref);
    if (!ms) return { ...unavailable('move_together', 'shared_time_unknown'), movesGames };
    shiftedSharers.push({ ref, ms: { start: ms.start + delta, end: ms.end + delta } });
  }
  const hullStart = Math.min(own[0].start + delta, ctx.next.start);
  const hullEnd = Math.max(own[own.length - 1].end + delta, ctx.next.end);
  const target: MsInterval = { start: hullStart, end: hullEnd };
  const kept = own.filter((o) => intervalsOverlap(o, target));
  const attempt = coverGaps(ctx, target, kept, court, caps);
  if (!attempt.ok) return { ...attemptFailure('move_together', attempt), movesGames };
  const dropped = slot.links.filter((l) => {
    const ms = linkMs(l);
    return ms != null && !intervalsOverlap(ms, target);
  });
  const moveSteps: MoveSharedGameStep[] = shiftedSharers.map(({ ref, ms }) => ({
    kind: 'move_shared_game',
    idempotencyKey: stepKey(ctx.gameId, slot.key, 'move_shared_game', `${ref.gameId}:${intervalKey(ms)}`),
    slotKey: slot.key,
    gameId: ref.gameId,
    name: ref.name,
    start: iso(ms.start),
    end: iso(ms.end),
  }));
  return {
    action: 'move_together',
    available: true,
    movesGames,
    extraMinutes: attempt.extraMinutes,
    steps: [
      ...bookSteps(ctx, slot.key, court, provider, caps, 'move_together', attempt.intervals, attempt.gaps),
      ...moveSteps,
      ...cancelSteps(ctx, slot, dropped),
    ],
  };
}

function emptyCounts(): Record<SlotOutcome, number> {
  return { unchanged: 0, keep: 0, move: 0, extend: 0, switch_court: 0, blocked: 0, manual: 0 };
}

export function planReschedule(input: PlanRescheduleInput): ReschedulePlan {
  const slotsSorted = [...input.slots].sort((a, b) => a.order - b.order || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const current = toMsInterval(input.currentWindow);
  const next = toMsInterval(input.newWindow);
  const summaryCounts = emptyCounts();

  if (!next) {
    const slots: SlotPlan[] = slotsSorted.map((slot) => ({
      slotKey: slot.key,
      order: slot.order,
      state: slot.state,
      outcome: 'blocked',
      options: [],
      steps: [],
      warnings: [],
      notes: ['invalid_window'],
    }));
    summaryCounts.blocked = slots.length;
    return { gameId: input.gameId, windowChanged: true, slots, steps: [], stepCount: 0, blocking: true, summaryCounts };
  }

  const windowChanged = !current || current.start !== next.start || current.end !== next.end;
  const blocks: ParsedBlock[] = [];
  for (const block of input.occupancy ?? []) {
    const ms = toMsInterval(block);
    if (ms) blocks.push({ block, ms, hard: HARD_KINDS.has(block.kind) });
  }
  blocks.sort(compareBlocks);

  const ctx: Ctx = {
    gameId: input.gameId,
    current: current ?? next,
    next,
    blocks,
    overrides: input.providerCapabilities,
    sharedWith: input.sharedWith ?? {},
    alternatives: input.freeAlternativeCourts ?? [],
    takenCourts: new Set(slotsSorted.map((s) => s.effectiveCourtId).filter((c): c is string => Boolean(c))),
  };

  const slots: SlotPlan[] = slotsSorted.map((slot) => {
    if (!windowChanged) {
      return finalize(ctx, slot, 'unchanged', [{ action: 'none', available: true, steps: [] }], ['window_unchanged']);
    }
    if (slot.state === 'planned') return planPlanned(ctx, slot);
    if (slot.state === 'reported') return planReported(ctx, slot);
    return planLinked(ctx, slot);
  });

  const save: SaveGameStep = {
    kind: 'save_game',
    idempotencyKey: stepKey(input.gameId, 'game', 'save_game', intervalKey(next)),
    start: iso(next.start),
    end: iso(next.end),
  };
  const ordered: { step: PlanStep; slotOrder: number; index: number }[] = [];
  slots.forEach((plan) => {
    plan.steps.forEach((step, index) => ordered.push({ step, slotOrder: plan.order, index }));
  });
  ordered.push({ step: save, slotOrder: -1, index: 0 });
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

  for (const plan of slots) summaryCounts[plan.outcome] += 1;
  return {
    gameId: input.gameId,
    windowChanged,
    slots,
    steps,
    stepCount: steps.length,
    blocking: slots.some((s) => s.outcome === 'blocked'),
    summaryCounts,
  };
}

/* ------------------------------------------------------------------ *
 * Gap fill (game-details primary action "Fill the 30 min gap")
 * ------------------------------------------------------------------ */

export type GapFillInput = {
  /** The slot as derived by `deriveCourtReservations`. */
  slot: Pick<CourtSlotView, 'effectiveCourtId' | 'links' | 'provider' | 'unknownTime'>;
  /** The game window the slot must cover. */
  window: IsoInterval;
  /** Provider to book with; defaults to the slot's provider. */
  provider?: string | null;
  /** Merged over {@link DEFAULT_PROVIDER_CAPABILITIES}. */
  capabilities?: ProviderCapabilityOverrides;
  /** Court occupancy around the window, excluding this game's own blocks. Hard kinds block. */
  blocks?: readonly OccupancyBlock[];
};

export type GapFillBooking = {
  courtId: string;
  start: string;
  end: string;
  /** Minutes this booking holds beyond the gap (provider lengths). */
  extraMinutes: number;
};

export type GapFillUnavailableReason =
  | 'no_gap'
  | 'no_court'
  | 'unknown_time'
  | 'cannot_book'
  | 'clash'
  | 'self_overlap'
  | 'duration_unavailable'
  | 'invalid_window';

export type GapFillResult = {
  /** Bookings to make, in time order; empty when unavailable or nothing is missing. */
  bookings: GapFillBooking[];
  /** Total minutes booked beyond the gaps. */
  extraMinutes: number;
  /** The uncovered parts of the window that the bookings close. */
  gaps: IsoInterval[];
  unavailableReason?: GapFillUnavailableReason;
  /** The hard blocks in the way (`clash`). */
  clash?: SlotClash;
  /** The rounding had to grow toward the other side (a block or the slot's own booking was in the way). */
  flipped?: boolean;
};

/**
 * What to book so a linked slot covers the whole game window — the same
 * rules as `extend` in {@link planReschedule}: only the uncovered gaps are
 * booked, each rounded UP to the provider's lengths and grown AWAY from the
 * slot's existing booking (a gap at the start grows earlier, at the end
 * later); if that hits a hard block or the slot's own booking, the other
 * direction is tried. Long gaps are split into several allowed lengths.
 * Pure; never books anything.
 */
export function planGapFill(input: GapFillInput): GapFillResult {
  const empty = (unavailableReason?: GapFillUnavailableReason, extra: Partial<GapFillResult> = {}): GapFillResult => ({
    bookings: [],
    extraMinutes: 0,
    gaps: [],
    ...(unavailableReason ? { unavailableReason } : {}),
    ...extra,
  });
  const window = toMsInterval(input.window);
  if (!window) return empty('invalid_window');
  const own = mergeIntervals(input.slot.links.map(linkMs).filter((i): i is MsInterval => i != null));
  if (input.slot.unknownTime || (input.slot.links.length > 0 && own.length === 0)) return empty('unknown_time');
  const gapsMs = computeCoverageGapsMs(window, own);
  const gaps = gapsMs.map((g) => ({ start: iso(g.start), end: iso(g.end) }));
  if (gapsMs.length === 0) return empty('no_gap');
  const court = input.slot.effectiveCourtId;
  if (!court) return empty('no_court', { gaps });
  const provider = input.provider ?? input.slot.provider ?? input.slot.links[0]?.provider ?? null;
  const caps = resolveProviderCapabilities(provider, input.capabilities);
  if (!provider || !caps || !caps.canBook) return empty('cannot_book', { gaps });

  const blocks: ParsedBlock[] = [];
  for (const block of input.blocks ?? []) {
    const ms = toMsInterval(block);
    if (ms) blocks.push({ block, ms, hard: HARD_KINDS.has(block.kind) });
  }
  blocks.sort(compareBlocks);
  const ctx: Ctx = {
    gameId: '',
    current: window,
    next: window,
    blocks,
    overrides: input.capabilities,
    sharedWith: {},
    alternatives: [],
    takenCourts: new Set(),
  };
  const attempt = coverGaps(ctx, window, own, court, caps);
  if (!attempt.ok) return empty(attempt.reason, { gaps, ...(attempt.clash ? { clash: attempt.clash } : {}) });
  const bookings = bookSteps(ctx, 'gap', court, provider, caps, 'extend', attempt.intervals, attempt.gaps)
    .map((s) => ({ courtId: s.courtId, start: s.start, end: s.end, extraMinutes: s.extraMinutes }))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return { bookings, extraMinutes: attempt.extraMinutes, gaps, ...(attempt.flipped ? { flipped: true } : {}) };
}
