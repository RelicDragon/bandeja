/**
 * Words for reschedule options, per-court sentences, run steps and run states.
 * Plain functions over `t` + the club clock, so they are testable and every
 * key lives in one place (namespace `courtReservation`).
 *
 * Per court the sheet shows ONE plain sentence with the real cause:
 * "The club has Court 1 reserved at 19:30. Reserves Court 5 19:00–21:00 instead."
 * "Adds 19:00–21:00 (Booktime sells 1h or 2h). Warm-up drills keeps its 17:00 reservation."
 */
import type { CourtSlotView } from '@shared/gameBooking/courtReservations';
import { parseInstantMs, type IsoInterval } from '@shared/gameBooking/coverageIntervals';
import type {
  BookStep,
  ManualClubReason,
  PlanStep,
  SharedGameRef,
  SlotPlanOption,
} from '@shared/gameBooking/planReschedule';
import {
  resolveProviderCapabilities,
  type ProviderCapabilityOverrides,
} from '@shared/gameBooking/providerCapabilities';
import { describeBlocker, primaryBlocker, providerDisplayName } from '@shared/gameBooking/reservationCopy';
import { sharersForSlot } from './courtReservationsCopy';
import type { CourtRef } from './courtReservationsModel';
import type { EffectiveSlotPlan } from './rescheduleChoices';
import type { RunJournal, RunStepRecord, RunStepStatus } from './reservationRunner';
import type { CourtReservationText } from './useCourtReservationText';

type Courts = Readonly<Record<string, CourtRef>>;

/** Unused minutes are only worth a word when they are this many and the organizer can do something. */
export const UNUSED_MINUTES_WORTH_MENTIONING = 60;

function courtName(courtId: string | null | undefined, courts: Courts, text: CourtReservationText): string {
  return (courtId && courts[courtId]?.name) || text.t('card.anyCourt');
}

export function optionLabel(option: SlotPlanOption, text: CourtReservationText): string {
  const { t } = text;
  switch (option.action) {
    case 'none':
      return t('move.option.none');
    case 'keep':
      return t('move.option.keep');
    case 'move':
      return t('move.option.move');
    case 'extend':
      return t('move.option.extend');
    case 'switch_court':
      return option.toCourt ? t('move.option.switchTo', { court: option.toCourt.name }) : t('move.option.switchCourt');
    case 'unlink':
      return t('move.option.unlink');
    case 'move_together':
      return t('move.option.moveTogether', { names: text.list((option.movesGames ?? []).map((g) => g.name)) });
    case 'manual':
      return t('move.option.manual');
  }
}

/** A row that needs no words: nothing happens to this court. */
export function isQuietSlot(slot: EffectiveSlotPlan): boolean {
  const action = slot.chosen?.action;
  return (
    !slot.blocked &&
    (action === 'none' || action === 'keep') &&
    slot.alternatives.length === 0 &&
    slot.plan.warnings.length === 0 &&
    !slot.plan.clash
  );
}

export type SlotSentenceContext = {
  courts: Courts;
  text: CourtReservationText;
  /** The draft window the plan was made for. */
  window: IsoInterval;
  /** The slot as shown on the card (links, court). */
  view?: Pick<CourtSlotView, 'links' | 'effectiveCourtId'> | null;
  sharedWith?: Readonly<Record<string, readonly SharedGameRef[] | undefined>>;
  providerCapabilities?: ProviderCapabilityOverrides;
};

function bookSpan(steps: readonly PlanStep[]): { start: string; end: string; provider: string; extra: number } | null {
  const books = steps.filter((s): s is BookStep => s.kind === 'book');
  if (books.length === 0) return null;
  const sorted = [...books].sort((a, b) => (parseInstantMs(a.start) ?? 0) - (parseInstantMs(b.start) ?? 0));
  return {
    start: sorted[0].start,
    end: sorted.reduce((end, s) => ((parseInstantMs(s.end) ?? 0) > (parseInstantMs(end) ?? 0) ? s.end : end), sorted[0].end),
    provider: sorted[0].provider,
    extra: books.reduce((sum, s) => sum + s.extraMinutes, 0),
  };
}

/** "19:00–21:00" or "19:00–21:00 (Booktime sells 1h or 2h)" when the club's lengths forced a longer booking. */
function bookedRange(span: NonNullable<ReturnType<typeof bookSpan>>, ctx: SlotSentenceContext): string {
  const { text } = ctx;
  const range = text.clock.range(span.start, span.end);
  if (span.extra <= 0) return range;
  const lengths = resolveProviderCapabilities(span.provider, ctx.providerCapabilities)?.durationsMinutes ?? [];
  if (lengths.length === 0) return range;
  return text.t('move.why.roundedRange', {
    range,
    provider: providerDisplayName(span.provider),
    lengths: text.list(lengths.map((m) => text.compactDuration(m)), 'disjunction'),
  });
}

function blockerText(slot: EffectiveSlotPlan, ctx: SlotSentenceContext): string | null {
  const clash = slot.plan.clash;
  if (!clash) return null;
  const block = primaryBlocker(clash.blocks, ctx.window);
  if (!block) return null;
  return ctx.text.copy(describeBlocker(block, courtName(clash.courtId, ctx.courts, ctx.text), ctx.window));
}

function softWarningText(slot: EffectiveSlotPlan, ctx: SlotSentenceContext): string | null {
  const block = primaryBlocker(slot.plan.warnings, ctx.window);
  if (!block) return null;
  return ctx.text.copy(describeBlocker(block, courtName(block.courtId, ctx.courts, ctx.text), ctx.window));
}

function sharerNames(ctx: SlotSentenceContext): { names: string; time: string } | null {
  const sharers = sharersForSlot(ctx.view ?? null, ctx.sharedWith);
  if (sharers.length === 0) return null;
  const firstLink = [...(ctx.view?.links ?? [])].sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0))[0];
  const start = firstLink?.startMs ?? parseInstantMs(firstLink?.bookingStart ?? '') ?? null;
  return {
    names: ctx.text.list(sharers.map((s) => s.name)),
    time: start != null ? ctx.text.clock.time(start) : '',
  };
}

function manualReason(option: SlotPlanOption): ManualClubReason | null {
  const step = option.steps.find((s) => s.kind === 'manual_club');
  return step && step.kind === 'manual_club' ? step.reason : null;
}

/**
 * One short, plain sentence (two at most) about what happens to this court
 * and why. Empty for a court where nothing happens.
 */
export function slotSentence(slot: EffectiveSlotPlan, ctx: SlotSentenceContext): string {
  const { t, clock } = ctx.text;
  const chosen = slot.chosen;
  const blocker = blockerText(slot, ctx);
  if (slot.blocked || !chosen) {
    return blocker ?? t('move.why.notAvailable');
  }
  const span = bookSpan(chosen.steps);
  const parts: string[] = [];
  switch (chosen.action) {
    case 'none':
      break;
    case 'keep': {
      const unused = chosen.unusedMinutes ?? slot.plan.unusedMinutes ?? 0;
      const canRelease = slot.alternatives.some((o) => o.action === 'move');
      parts.push(
        unused >= UNUSED_MINUTES_WORTH_MENTIONING && canRelease
          ? t('move.why.keepUnused', { duration: ctx.text.duration(unused) })
          : t('move.why.keep'),
      );
      break;
    }
    case 'move': {
      const range = span ? bookedRange(span, ctx) : clock.range(ctx.window.start, ctx.window.end);
      const viaClub = chosen.steps.some((s) => s.kind === 'manual_cancel');
      parts.push(viaClub ? t('move.why.moveCancelWithClub', { range }) : t('move.why.move', { range }));
      break;
    }
    case 'extend': {
      parts.push(span ? t('move.why.extend', { range: bookedRange(span, ctx) }) : t('move.why.keep'));
      const sharers = sharerNames(ctx);
      if (sharers) {
        parts.push(sharers.time ? t('move.why.sharerKeeps', sharers) : t('move.why.sharerKeepsNoTime', sharers));
      } else {
        const unused = chosen.unusedMinutes ?? 0;
        if (unused >= UNUSED_MINUTES_WORTH_MENTIONING && slot.alternatives.some((o) => o.action === 'move')) {
          parts.push(t('move.why.unused', { duration: ctx.text.duration(unused) }));
        }
      }
      break;
    }
    case 'switch_court': {
      const court = chosen.toCourt?.name ?? t('card.anyCourt');
      const instead = span
        ? t('move.why.switchBook', { court, range: bookedRange(span, ctx) })
        : t('move.why.switchPlanned', { court });
      if (blocker) parts.push(blocker);
      parts.push(instead);
      break;
    }
    case 'unlink': {
      const sharers = sharerNames(ctx);
      parts.push(sharers ? t('move.why.unlink', { names: sharers.names }) : t('move.why.unlinkNoNames'));
      break;
    }
    case 'move_together': {
      const names = ctx.text.list((chosen.movesGames ?? []).map((g) => g.name));
      const moved = chosen.steps.find((st) => st.kind === 'move_shared_game');
      parts.push(
        moved && moved.kind === 'move_shared_game'
          ? t('move.why.moveTogether', { names, time: clock.time(moved.start) })
          : t('move.why.moveTogetherNoTime', { names }),
      );
      break;
    }
    case 'manual': {
      const reason = manualReason(chosen);
      const club = chosen.steps.find((st) => st.kind === 'manual_club');
      const provider = providerDisplayName(club && club.kind === 'manual_club' ? club.provider : null);
      switch (reason) {
        case 'reported':
          parts.push(t('move.why.manualReported'));
          break;
        case 'cannot_book':
          parts.push(provider ? t('move.why.manualCannotBook', { provider }) : t('move.why.manualChoice'));
          break;
        case 'no_court':
          parts.push(t('move.why.manualNoCourt'));
          break;
        case 'unknown_time':
          parts.push(t('move.why.manualUnknownTime'));
          break;
        default:
          parts.push(t('move.why.manualChoice'));
      }
      // A reported court the club has busy: say so, it is what they will be asked about.
      if (blocker) parts.push(blocker);
      break;
    }
  }
  const soft = softWarningText(slot, ctx);
  if (soft) parts.push(soft);
  return parts.join(' ');
}

/* ------------------------------------------------------------------ *
 * Run steps
 * ------------------------------------------------------------------ */

export type StepLabelContext = {
  /** Every step of the run (a switch's booking absorbs its court reassignment). */
  steps?: readonly PlanStep[];
  /** Players told about the new time (save step). */
  playerCount?: number;
  /** Old reservation times by provider booking id ("Cancel the old 18:00–19:30 reservation"). */
  linkTimes?: Readonly<Record<string, { start?: string | null; end?: string | null; courtId?: string | null }>>;
};

function reassignFor(step: BookStep, ctx: StepLabelContext | undefined) {
  if (step.purpose !== 'switch_court') return null;
  return (ctx?.steps ?? []).find((s) => s.kind === 'reassign_court' && s.slotKey === step.slotKey && s.toCourtId === step.courtId) ?? null;
}

/** Reassignments shown as part of their booking line ("Reserve Court 5 instead of Court 1"). */
export function isMergedIntoBooking(step: PlanStep, steps: readonly PlanStep[]): boolean {
  if (step.kind !== 'reassign_court') return false;
  return steps.some((s) => s.kind === 'book' && s.purpose === 'switch_court' && s.slotKey === step.slotKey && s.courtId === step.toCourtId);
}

/** The records the checklist shows, in order (merged reassignments hidden). */
export function visibleRunSteps(journal: RunJournal): RunStepRecord[] {
  const steps = journal.steps.map((r) => r.step);
  return journal.steps.filter((r) => !isMergedIntoBooking(r.step, steps));
}

export function stepLabel(step: PlanStep, courts: Courts, text: CourtReservationText, ctx?: StepLabelContext): string {
  const { t, clock } = text;
  switch (step.kind) {
    case 'book': {
      const reassign = reassignFor(step, ctx);
      const range = clock.range(step.start, step.end);
      if (reassign && reassign.kind === 'reassign_court' && reassign.fromCourtId) {
        return t('run.step.bookInstead', {
          court: courtName(step.courtId, courts, text),
          fromCourt: courtName(reassign.fromCourtId, courts, text),
          range,
        });
      }
      return t('run.step.bookRange', { court: courtName(step.courtId, courts, text), range });
    }
    case 'reassign_court':
      return step.fromCourtId
        ? t('run.step.reassignInstead', { court: courtName(step.toCourtId, courts, text), fromCourt: courtName(step.fromCourtId, courts, text) })
        : t('run.step.reassign', { court: courtName(step.toCourtId, courts, text) });
    case 'save_game': {
      const range = clock.range(step.start, step.end);
      return ctx?.playerCount && ctx.playerCount > 0
        ? t('run.step.saveAndTell', { range, count: ctx.playerCount })
        : t('run.step.saveRange', { range });
    }
    case 'unlink':
      return t('run.step.unlink');
    case 'move_shared_game':
      return t('run.step.moveShared', { name: step.name, from: clock.time(step.start), to: clock.time(step.end) });
    case 'cancel': {
      const old = ctx?.linkTimes?.[step.externalBookingId];
      const provider = providerDisplayName(step.provider);
      return old?.start && old.end
        ? t('run.step.cancelRange', { provider, range: clock.range(old.start, old.end) })
        : t('run.step.cancel', { provider });
    }
    case 'manual_cancel': {
      const old = ctx?.linkTimes?.[step.externalBookingId];
      return old?.start && old.end
        ? t('run.step.manualCancelRange', { range: clock.range(old.start, old.end) })
        : t('run.step.manualCancel');
    }
    case 'manual_club':
      return t('run.step.manualClub', { court: courtName(step.courtId, courts, text), from: clock.time(step.start), to: clock.time(step.end) });
  }
}

const STATUS_KEY: Record<RunStepStatus, string> = {
  pending: 'run.status.pending',
  running: 'run.status.running',
  done: 'run.status.done',
  failed: 'run.status.failed',
  skipped: 'run.status.skipped',
  follow_up: 'run.status.followUp',
  rolled_back: 'run.status.rolledBack',
  left_at_club: 'run.status.leftAtClub',
};

export function stepStatusLabel(status: RunStepStatus, text: CourtReservationText): string {
  return text.t(STATUS_KEY[status]);
}

export function runHeadline(journal: RunJournal, text: CourtReservationText): string {
  const { t } = text;
  if (journal.error?.code === 'reservationChange.running') return t('run.otherRun.title');
  switch (journal.phase) {
    case 'running':
      return t('run.title');
    case 'done':
      return journal.followUps.length > 0 ? t('run.doneWithFollowUps') : t('run.done');
    case 'rolled_back':
      return journal.error?.code === 'court.clash' ? t('run.clashFromServer') : t('run.rolledBack');
    case 'paused':
      return t('run.paused');
  }
}
