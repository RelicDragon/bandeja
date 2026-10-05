/**
 * Move a game in time without losing its courts.
 *
 * Plan view: court lanes with the game as a draggable column (15-minute snap;
 * steppers as the precise path; a dashed lane shows a court the game would
 * switch to). Under it, one calm row per court that changes: the chosen
 * outcome, one plain sentence with the real cause, and a quiet "Change" that
 * opens the alternatives as a radio list — never more than one decision on
 * screen per row. Courts where nothing happens collapse into one line. A
 * clash row is red with a one-tap fix. The sticky footer says what the tap
 * will do: "Move game · 3 steps", "Resolve the clash first", or "No changes".
 *
 * Run view: every step on screen at once, ticking as the runner (owned by
 * the parent: `run` + callbacks) moves; a failure shows inline with retry.
 * A clash the server found at save time sends the organizer back to the plan
 * with that clash drawn in. If another change is already running for this
 * game, nothing runs: the sheet says so and offers "Finish it" (ours) or
 * asks to wait.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, ChevronDown, Hourglass, TriangleAlert, Wand2 } from 'lucide-react';
import type { CourtSlotView } from '@shared/gameBooking/courtReservations';
import { MINUTE_MS, parseInstantMs, type IsoInterval } from '@shared/gameBooking/coverageIntervals';
import type { OccupancyBlock, SharedGameRef, SlotPlanOption } from '@shared/gameBooking/planReschedule';
import type { ProviderCapabilityOverrides } from '@shared/gameBooking/providerCapabilities';
import { describeRescheduleOutcome } from '@shared/gameBooking/reservationCopy';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer';
import { OverlayKeyboardBody } from '@/components/ui/OverlayKeyboardBody';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { useAuthStore } from '@/store/authStore';
import { slotCourtName } from './courtReservationsCopy';
import type { CourtRef, TimelineRange } from './courtReservationsModel';
import { isAutomaticStep, type ClashFix, type EffectiveReschedulePlan, type EffectiveSlotPlan } from './rescheduleChoices';
import { isQuietSlot, optionLabel, runHeadline, slotSentence, visibleRunSteps, type SlotSentenceContext } from './rescheduleCopy';
import { RescheduleTimeline, type TimelineLane } from './RescheduleTimeline';
import { ReservationRunChecklist } from './ReservationRunChecklist';
import { activeRunOf, clashDetailsOf, isBlockedByOtherRun, type RunJournal } from './reservationRunner';
import { useCourtReservationText, type CourtReservationText } from './useCourtReservationText';
import { useReschedulePlan, type ReschedulePlanSource } from './useReschedulePlan';
import './courtReservations.css';

export type RescheduleSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gameId: string;
  currentWindow: IsoInterval;
  slots: readonly CourtSlotView[];
  courtsById: Readonly<Record<string, CourtRef>>;
  /** All club courts in preference order (alternatives for "switch court"). */
  clubCourts: readonly CourtRef[];
  timeZone: string;
  occupancy?: readonly OccupancyBlock[];
  sharedWith?: Readonly<Record<string, readonly SharedGameRef[] | undefined>>;
  providerCapabilities?: ProviderCapabilityOverrides;
  /** Players who get the one time-change notice. */
  playerCount: number;
  /** How far the game may be dragged (e.g. opening hours). Default: ±3 h. */
  bounds?: TimelineRange | null;
  /** The current run (parent-owned runner), or null in plan mode. */
  run: RunJournal | null;
  onConfirm: (plan: EffectiveReschedulePlan, newWindow: IsoInterval) => void;
  onRetry?: () => void;
  /** Leave the run view (rolled back → back to the plan; done → close). */
  onDismissRun?: () => void;
  /**
   * "Finish it": another change of ours is already running for this game
   * (server 409) — adopt and finish it (`runner.resumeActive`).
   */
  onResumeOtherRun?: () => void;
  /** Whose run is "ours" (defaults to the signed-in user). */
  currentUserId?: string | null;
  /** The runner is busy (disables retry / finish buttons). */
  busy?: boolean;
};

type LinkTimes = Record<string, { start?: string | null; end?: string | null; courtId?: string | null }>;

function defaultBounds(window: IsoInterval): TimelineRange | null {
  const s = parseInstantMs(window.start);
  const e = parseInstantMs(window.end);
  if (s == null || e == null) return null;
  const pad = 3 * 60 * MINUTE_MS;
  const step = 30 * MINUTE_MS;
  return { startMs: Math.floor((s - pad) / step) * step, endMs: Math.ceil((e + pad) / step) * step };
}

function OptionRadio({
  option,
  selected,
  label,
  onSelect,
}: {
  option: SlotPlanOption;
  selected: boolean;
  label: string;
  onSelect: (option: SlotPlanOption) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-option={option.action}
      onClick={() => onSelect(option)}
      className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-2 text-start text-sm text-gray-800 transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-100 dark:hover:bg-gray-800"
    >
      <span
        aria-hidden
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          selected ? 'border-primary-600 dark:border-primary-400' : 'border-gray-300 dark:border-gray-600'
        }`}
      >
        {selected ? <span className="cr-pop h-2 w-2 rounded-full bg-primary-600 dark:bg-primary-400" /> : null}
      </span>
      <span className={selected ? 'font-medium' : ''}>{label}</span>
    </button>
  );
}

function OutcomeRow({
  slot,
  name,
  fix,
  sentenceCtx,
  text,
  onChoose,
  onFix,
}: {
  slot: EffectiveSlotPlan;
  name: string;
  fix: ClashFix | null;
  sentenceCtx: SlotSentenceContext;
  text: CourtReservationText;
  onChoose: (option: SlotPlanOption) => void;
  onFix: (fix: ClashFix) => void;
}) {
  const { t, clock } = text;
  const [expanded, setExpanded] = useState(false);
  const listId = `cr-options-${slot.plan.slotKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const sentence = slotSentence(slot, sentenceCtx);
  const headline = slot.blocked ? text.copy(describeRescheduleOutcome('blocked')) : slot.chosen ? optionLabel(slot.chosen, text) : '';
  // Options in the planner's order (default first), only the runnable ones.
  const options = slot.plan.options.filter((o) => o.available);
  const canChange = options.length > 1 || (slot.blocked && options.length > 0);
  const fixLabel =
    fix?.kind === 'choose'
      ? t('move.fix.use', { option: optionLabel(fix.option, text) })
      : fix?.kind === 'move_time'
        ? t('move.fix.moveTo', { time: clock.range(fix.window.start, fix.window.end) })
        : null;

  return (
    <li
      data-slot-key={slot.plan.slotKey}
      data-blocked={slot.blocked || undefined}
      className={`cr-enter rounded-2xl px-3 py-2.5 transition-colors duration-200 ${
        slot.blocked ? 'bg-red-50 ring-1 ring-inset ring-red-200 dark:bg-red-950/30 dark:ring-red-900' : 'bg-gray-50 dark:bg-gray-900/60'
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">{name}</span>
        <span
          className={`flex shrink-0 items-center gap-1 text-xs font-medium ${
            slot.blocked ? 'text-red-700 dark:text-red-300' : 'text-gray-600 dark:text-gray-300'
          }`}
        >
          {slot.blocked ? <TriangleAlert size={13} aria-hidden className="self-center" /> : null}
          {headline}
        </span>
      </div>
      {sentence ? (
        <p className={`mt-1 text-[13px] leading-snug ${slot.blocked ? 'text-red-800 dark:text-red-200' : 'text-gray-600 dark:text-gray-300'}`}>
          {sentence}
        </p>
      ) : null}
      {(slot.blocked && fix && fixLabel) || canChange ? (
        <div className="-mb-2 mt-1 flex flex-wrap items-center gap-2">
          {slot.blocked && fix && fixLabel ? (
            <button
              type="button"
              onClick={() => onFix(fix)}
              data-clash-fix={fix.kind}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-red-600 px-4 text-xs font-semibold text-white transition-[background-color,transform] hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 active:scale-[0.98] dark:focus-visible:ring-offset-gray-900 ${pressScaleGuard}`}
            >
              <Wand2 size={14} aria-hidden />
              {fixLabel}
            </button>
          ) : null}
          {canChange ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={listId}
              aria-label={t('move.changeFor', { court: name })}
              onClick={() => setExpanded((v) => !v)}
              className="-ms-2 inline-flex min-h-[44px] items-center gap-1 rounded-full px-2 text-xs font-medium text-primary-700 hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-300 dark:hover:bg-primary-950/40"
            >
              {t('move.change')}
              <ChevronDown size={14} aria-hidden className={`transition-transform duration-200 motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />
            </button>
          ) : null}
        </div>
      ) : null}
      {expanded && canChange ? (
        <div id={listId} role="radiogroup" aria-label={t('move.changeFor', { court: name })} className="cr-enter -mx-1 mt-1 flex flex-col">
          {options.map((option) => (
            <OptionRadio
              key={option.action}
              option={option}
              selected={option === slot.chosen}
              label={optionLabel(option, text)}
              onSelect={(o) => {
                if (o !== slot.chosen) onChoose(o);
                setExpanded(false);
              }}
            />
          ))}
        </div>
      ) : null}
    </li>
  );
}

function footerLabel(plan: EffectiveReschedulePlan, text: CourtReservationText): string {
  const { t } = text;
  switch (plan.footer.kind) {
    case 'no_changes':
      return t('move.footer.noChanges');
    case 'blocked':
      return t('move.footer.blocked');
    case 'ready':
      return t('move.footer.move', { count: plan.steps.filter(isAutomaticStep).length });
  }
}

export function RescheduleSheet(props: RescheduleSheetProps) {
  const {
    open,
    onOpenChange,
    gameId,
    currentWindow,
    slots,
    courtsById,
    clubCourts,
    timeZone,
    occupancy,
    sharedWith,
    providerCapabilities,
    playerCount,
    bounds: boundsProp,
    run,
    onConfirm,
    onRetry,
    onDismissRun,
    onResumeOtherRun,
    currentUserId: currentUserIdProp,
    busy = false,
  } = props;
  const text = useCourtReservationText(timeZone);
  const { t } = text;
  const authUserId = useAuthStore((state) => state.user?.id ?? null);
  const currentUserId = currentUserIdProp !== undefined ? currentUserIdProp : authUserId;
  useBackButtonModal(open, () => onOpenChange(false), `reschedule-${gameId}`);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // A clash the server reported at save time is drawn in as club blocks.
  const [serverClashes, setServerClashes] = useState<OccupancyBlock[]>([]);
  useEffect(() => {
    const details = clashDetailsOf(run);
    if (details.length > 0) {
      setServerClashes(details.map((d) => ({ courtId: d.courtId, start: d.start, end: d.end, kind: 'club' as const })));
    }
  }, [run]);

  const allOccupancy = useMemo(() => [...(occupancy ?? []), ...serverClashes], [occupancy, serverClashes]);
  const bounds = useMemo(() => boundsProp ?? defaultBounds(currentWindow), [boundsProp, currentWindow]);
  const source = useMemo<ReschedulePlanSource>(
    () => ({
      gameId,
      currentWindow,
      slots,
      occupancy: allOccupancy,
      sharedWith,
      alternativeCourts: clubCourts.map((c) => ({ courtId: c.id, name: c.name })),
      providerCapabilities,
    }),
    [gameId, currentWindow, slots, allOccupancy, sharedWith, clubCourts, providerCapabilities],
  );
  const planner = useReschedulePlan(source, bounds);
  const { effective } = planner;

  const lanes: TimelineLane[] = useMemo(() => {
    const out: TimelineLane[] = [];
    for (const slot of slots) {
      const plan = effective.slots.find((s) => s.plan.slotKey === slot.key);
      const switchTo = plan?.chosen?.action === 'switch_court' ? plan.chosen.toCourt ?? null : null;
      out.push({
        key: slot.key,
        label: slotCourtName(slot, courtsById, t),
        courtId: slot.effectiveCourtId,
        reservations: slot.links
          .filter((l) => l.startMs != null && l.endMs != null)
          .map((l) => ({ start: new Date(l.startMs as number).toISOString(), end: new Date(l.endMs as number).toISOString() })),
        // Red only when nothing can run for this court at the draft time.
        clash: Boolean(plan?.blocked && plan.plan.clash),
        variant: switchTo ? 'leaving' : 'default',
        caption: switchTo ? t('timeline.movesTo', { court: switchTo.name }) : undefined,
        reported: slot.state === 'reported',
        reportedWindow: slot.state === 'reported' ? currentWindow : null,
      });
      if (switchTo) {
        out.push({
          key: `ghost:${slot.key}`,
          label: switchTo.name,
          courtId: switchTo.courtId,
          reservations: [],
          clash: false,
          variant: 'ghost',
          caption: t('timeline.free'),
        });
      }
    }
    return out;
  }, [slots, effective.slots, courtsById, t, currentWindow]);

  const blockedByOtherRun = isBlockedByOtherRun(run);
  const activeRun = activeRunOf(run);
  const otherRunIsOurs = Boolean(activeRun && activeRun.createdById && currentUserId && activeRun.createdById === currentUserId);
  const showRun = run != null && !(run.phase === 'rolled_back' && clashDetailsOf(run).length > 0);
  const runActive = run?.phase === 'running' && !blockedByOtherRun;
  const title = showRun && run ? runHeadline(run, text) : t('move.title');
  const footerDisabled = effective.footer.kind !== 'ready';
  // Old reservation times as they were when the run started: the parent may refresh `slots`
  // mid-run (the cancelled link disappears), but "Cancel the old 18:00–19:30 reservation" must not lose its time.
  const [runLinkTimes, setRunLinkTimes] = useState<LinkTimes>({});
  const linkTimes = useMemo(() => {
    const out: LinkTimes = { ...runLinkTimes };
    for (const slot of slots) {
      for (const l of slot.links) out[l.externalBookingId] = { start: l.bookingStart, end: l.bookingEnd, courtId: l.courtId };
    }
    return out;
  }, [slots, runLinkTimes]);

  const sentenceBase = useMemo(
    () => ({ courts: courtsById, text, window: planner.newWindow, sharedWith, providerCapabilities }),
    [courtsById, text, planner.newWindow, sharedWith, providerCapabilities],
  );
  const loud = effective.slots.filter((s) => !isQuietSlot(s));
  const quiet = effective.slots.filter((s) => isQuietSlot(s));
  const viewOf = (slotKey: string) => slots.find((s) => s.key === slotKey) ?? null;
  const nameOf = (slotKey: string) => {
    const view = viewOf(slotKey);
    return view ? slotCourtName(view, courtsById, t) : t('card.anyCourt');
  };

  // Focus: the heading when the sheet opens and whenever the view changes
  // (plan ↔ run), so screen readers hear where they are and nothing jumps.
  const view = showRun ? (blockedByOtherRun ? 'other' : 'run') : 'plan';
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => headingRef.current?.focus({ preventScroll: true }), 0);
    return () => window.clearTimeout(id);
  }, [open, view]);

  // Progress over the steps the organizer sees (merged court switches count once).
  const shownSteps = run ? visibleRunSteps(run).filter((r) => isAutomaticStep(r.step)) : [];
  const automaticTotal = shownSteps.length;
  const automaticDone = shownSteps.filter((r) => r.status !== 'pending' && r.status !== 'running').length;

  const secondaryBtn =
    'min-h-[52px] flex-1 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-gray-700 dark:text-white dark:hover:bg-gray-700/50';
  const primaryBtn = `flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-primary-600 text-sm font-semibold text-white shadow-sm transition-[background-color,transform] duration-150 hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:opacity-60 enabled:active:scale-[0.98] dark:focus-visible:ring-offset-gray-800 ${pressScaleGuard}`;

  return (
    <Drawer open={open} onOpenChange={(next) => (runActive ? undefined : onOpenChange(next))} dismissible={!runActive}>
      <DrawerContent
        accessibleTitle={title}
        className="max-h-[92vh] px-4"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          headingRef.current?.focus({ preventScroll: true });
        }}
      >
        <div aria-hidden className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />
        <DrawerHeader className="px-0 pb-2 text-start">
          <DrawerTitle ref={headingRef} tabIndex={-1} className="outline-none">
            {title}
          </DrawerTitle>
        </DrawerHeader>
        <OverlayKeyboardBody className="min-h-0 flex-1 overflow-y-auto pb-4">
          {view === 'other' ? (
            <div key="other" className="cr-enter flex items-start gap-3 rounded-2xl bg-amber-50 p-3 dark:bg-amber-950/40" data-testid="other-run-notice">
              <Hourglass size={18} aria-hidden className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
              <p className="text-sm leading-snug text-amber-950 dark:text-amber-50">
                {otherRunIsOurs && onResumeOtherRun ? t('run.otherRun.ours') : t('run.otherRun.someoneElse')}
              </p>
            </div>
          ) : view === 'run' && run ? (
            <div key="run" className="cr-fade">
              <ReservationRunChecklist
                journal={run}
                courtsById={courtsById}
                text={text}
                linkTimes={linkTimes}
                playerCount={playerCount}
                onRetry={onRetry}
                retryBusy={busy}
              />
            </div>
          ) : (
            <div key="plan" className="cr-fade">
              {serverClashes.length > 0 ? (
                <p className="cr-enter mb-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
                  <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
                  {t('run.clashFromServer')}
                </p>
              ) : null}
              {bounds ? (
                <RescheduleTimeline
                  lanes={lanes}
                  occupancy={allOccupancy}
                  range={bounds}
                  currentWindow={currentWindow}
                  draft={planner.draft}
                  text={text}
                  onDraftChange={planner.setDraft}
                  onShiftStart={planner.shiftStart}
                  onChangeLength={planner.changeLength}
                />
              ) : null}

              {effective.windowChanged ? (
                <ul className="mt-4 flex flex-col gap-2" aria-label={t('move.courtsLabel')}>
                  {loud.map((slot) => (
                    <OutcomeRow
                      key={slot.plan.slotKey}
                      slot={slot}
                      name={nameOf(slot.plan.slotKey)}
                      fix={planner.fixes[slot.plan.slotKey] ?? null}
                      sentenceCtx={{ ...sentenceBase, view: viewOf(slot.plan.slotKey) }}
                      text={text}
                      onChoose={(option) => planner.choose(slot.plan.slotKey, option.action)}
                      onFix={(fix) => planner.applyFix(slot.plan.slotKey, fix)}
                    />
                  ))}
                  {quiet.length > 0 ? (
                    <li className="cr-enter px-3 py-1 text-[13px] text-gray-500 dark:text-gray-400" data-quiet-slots={quiet.length}>
                      {t('move.unchanged', { courts: text.list(quiet.map((s) => nameOf(s.plan.slotKey))) })}
                    </li>
                  ) : null}
                </ul>
              ) : null}

              {effective.windowChanged && playerCount > 0 ? (
                <p className="mt-3 flex items-center gap-2 px-1 text-xs text-gray-500 dark:text-gray-400">
                  <Bell size={14} aria-hidden className="shrink-0" />
                  {t('move.notice', { count: playerCount })}
                </p>
              ) : null}
            </div>
          )}
        </OverlayKeyboardBody>

        <div className="sticky bottom-0 -mx-4 border-t border-gray-100 bg-white/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur dark:border-gray-700 dark:bg-gray-800/95">
          {view === 'other' ? (
            otherRunIsOurs && onResumeOtherRun ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onDismissRun?.();
                    onOpenChange(false);
                  }}
                  className={secondaryBtn}
                >
                  {t('run.later')}
                </button>
                <button type="button" disabled={busy} onClick={onResumeOtherRun} className={`${primaryBtn} flex-[2]`}>
                  {t('run.otherRun.finishIt')}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => onDismissRun?.()} className={primaryBtn}>
                {t('run.backToPlan')}
              </button>
            )
          ) : view === 'run' && run ? (
            run.phase === 'running' ? (
              <button type="button" disabled aria-live="polite" className={`${primaryBtn} gap-2`}>
                <span>{t('run.working')}</span>
                {automaticTotal > 1 ? (
                  <span className="font-normal tabular-nums opacity-80">
                    {t('run.progress', { done: Math.min(automaticDone + 1, automaticTotal), total: automaticTotal })}
                  </span>
                ) : null}
              </button>
            ) : run.phase === 'paused' ? (
              <div className="flex gap-2">
                <button type="button" onClick={() => onOpenChange(false)} className={secondaryBtn}>
                  {t('run.later')}
                </button>
                <button type="button" disabled={busy} onClick={onRetry} className={`${primaryBtn} flex-[2]`}>
                  {t('run.retry')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onDismissRun?.();
                  if (run.phase === 'done') onOpenChange(false);
                }}
                className={primaryBtn}
              >
                {run.phase === 'done' ? t('run.close') : t('run.backToPlan')}
              </button>
            )
          ) : (
            <button
              type="button"
              disabled={footerDisabled}
              data-footer-state={effective.footer.kind}
              onClick={() => {
                setServerClashes([]);
                setRunLinkTimes(linkTimes);
                onConfirm(effective, planner.newWindow);
              }}
              className={`flex min-h-[52px] w-full items-center justify-center rounded-2xl text-sm font-semibold transition-[background-color,transform] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 enabled:active:scale-[0.98] ${pressScaleGuard} ${
                footerDisabled
                  ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                  : 'bg-primary-600 text-white shadow-sm hover:bg-primary-700'
              }`}
            >
              {footerLabel(effective, text)}
            </button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
