/**
 * One court slot, up close (bottom sheet).
 *
 * A mini timeline puts this court's reservations against the game window;
 * games sharing the reservation are listed in words. At most three actions,
 * chosen from the state ({@link slotSheetActions}):
 *   Planned  → Reserve now · Link my reservation · Mark as reserved
 *   Reported → Link reservation · Mark not reserved
 *   Linked   → Verify · Unlink · Cancel at the club (provider can cancel, not shared)
 * An "Any court" slot picks its court inline first. Actions are callbacks.
 *
 * With `canAssignCourt`, choosing a court is also a decision of its own
 * (`assign_court`): an "Any court" slot can just take a court ("Use Court 3,
 * reserve later") and a planned slot can "Change court" — neither forces a
 * reservation choice.
 *
 * The caller closes the sheet when an action succeeds; on failure it stays
 * open and shows `error` inline (role="alert") above the actions.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { CourtSlotView } from '@shared/gameBooking/courtReservations';
import type { IsoInterval } from '@shared/gameBooking/coverageIntervals';
import type { SharedGameRef } from '@shared/gameBooking/planReschedule';
import type { ProviderCapabilityOverrides } from '@shared/gameBooking/providerCapabilities';
import { describeCourtSlot, providerDisplayName } from '@shared/gameBooking/reservationCopy';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer';
import { OverlayKeyboardBody } from '@/components/ui/OverlayKeyboardBody';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import {
  courtPickMode,
  paddedTimelineRange,
  slotSheetActions,
  timelinePercent,
  type CourtRef,
  type SlotActionKind,
  type SlotActionSpec,
} from './courtReservationsModel';
import { sharersForSlot, slotCourtName } from './courtReservationsCopy';
import { ReservationPill } from './ReservationPill';
import { pillToneForSlot } from './reservationPillTone';
import { TimelineAxis, TimelineGrid } from './TimelineAxis';
import { useCourtReservationText, type CourtReservationText } from './useCourtReservationText';
import './courtReservations.css';

export type CourtSlotSheetAction = {
  kind: SlotActionKind;
  slot: CourtSlotView;
  linkId?: string;
  /** Court picked inline for an "Any court" slot. */
  courtId?: string | null;
};

export type CourtSlotSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: CourtSlotView | null;
  window: IsoInterval | null;
  courtsById: Readonly<Record<string, CourtRef>>;
  timeZone: string;
  canEdit: boolean;
  /** The club has a booking integration this player can book through. */
  canBookHere: boolean;
  canVerify?: (provider: string) => boolean;
  providerCapabilities?: ProviderCapabilityOverrides;
  /** Other games using a reservation, keyed by link id or provider booking id. */
  sharedWith?: Readonly<Record<string, readonly SharedGameRef[] | undefined>>;
  /** Courts an "Any court" slot may take (free for the game window). */
  pickableCourts?: readonly CourtRef[];
  pendingAction?: SlotActionKind | null;
  onAction: (action: CourtSlotSheetAction) => void;
  nested?: boolean;
  /**
   * Offer choosing a court on its own: "Any court" → pick → `assign_court`;
   * planned slot with a court → "Change court" → pick → `assign_court`
   * (the slot still carries its old court). Off by default.
   */
  canAssignCourt?: boolean;
  /** The last action failed: shown inline, the sheet stays open. */
  error?: string | null;
};

const ACTION_KEY: Record<SlotActionKind, string> = {
  reserve: 'sheet.action.reserve',
  link: 'sheet.action.link',
  mark_reserved: 'sheet.action.markReserved',
  mark_not_reserved: 'sheet.action.markNotReserved',
  verify: 'sheet.action.verify',
  unlink: 'sheet.action.unlink',
  cancel_at_club: 'sheet.action.cancelAtClub',
  assign_court: 'sheet.action.changeCourt',
};

function actionLabel(spec: SlotActionSpec, slot: CourtSlotView, t: CourtReservationText['t']): string {
  if (spec.kind === 'link' && slot.state === 'reported') return t('sheet.action.linkReported');
  return t(ACTION_KEY[spec.kind]);
}

function SlotTimeline({
  slot,
  window,
  sharers,
  text,
}: {
  slot: CourtSlotView;
  window: IsoInterval | null;
  sharers: SharedGameRef[];
  text: CourtReservationText;
}) {
  const linkWindows = slot.links
    .filter((l) => l.startMs != null && l.endMs != null)
    .map((l) => ({ start: new Date(l.startMs as number).toISOString(), end: new Date(l.endMs as number).toISOString(), id: l.id }));
  const range = paddedTimelineRange([...(window ? [window] : []), ...linkWindows, ...sharers], 30);
  if (!range) return null;
  const game = window ? timelinePercent(window, range) : null;
  return (
    <div className="rounded-2xl bg-gray-50 p-3 dark:bg-gray-900/60" aria-hidden>
      <div className="relative h-14">
        <TimelineGrid range={range} timeZone={text.clock.timeZone} />
        {game ? (
          <span
            className="absolute top-0 h-6 rounded-lg border-2 border-primary-500/80 bg-primary-500/10 dark:border-primary-400/80"
            style={{ insetInlineStart: `${game.offset}%`, width: `${game.width}%` }}
          />
        ) : null}
        {linkWindows.map((l) => {
          const p = timelinePercent(l, range);
          return p ? (
            <span
              key={l.id}
              className="cr-grow absolute top-1.5 h-3 rounded-md bg-emerald-500 dark:bg-emerald-400"
              style={{ insetInlineStart: `${p.offset}%`, width: `${p.width}%` }}
            />
          ) : null;
        })}
        {slot.gaps.map((g) => {
          const p = timelinePercent(g, range);
          return p ? (
            <span
              key={`gap:${g.start}`}
              className="absolute top-1.5 h-3 rounded-md bg-[repeating-linear-gradient(135deg,var(--color-amber-400)_0_4px,transparent_4px_8px)] opacity-90"
              style={{ insetInlineStart: `${p.offset}%`, width: `${p.width}%` }}
            />
          ) : null;
        })}
        {sharers.map((s) => {
          const p = timelinePercent(s, range);
          return p ? (
            <span
              key={s.gameId}
              className="absolute top-8 h-4 truncate rounded-md bg-gray-300/80 px-1 text-[10px] leading-4 text-gray-700 dark:bg-gray-600/80 dark:text-gray-100"
              style={{ insetInlineStart: `${p.offset}%`, width: `${p.width}%` }}
            >
              {s.name}
            </span>
          ) : null;
        })}
      </div>
      <TimelineAxis range={range} clock={text.clock} />
    </div>
  );
}

export function CourtSlotSheet({
  open,
  onOpenChange,
  slot,
  window,
  courtsById,
  timeZone,
  canEdit,
  canBookHere,
  canVerify,
  providerCapabilities,
  sharedWith,
  pickableCourts = [],
  pendingAction = null,
  onAction,
  nested,
  canAssignCourt = false,
  error = null,
}: CourtSlotSheetProps) {
  const text = useCourtReservationText(timeZone);
  const { t, clock } = text;
  const [pickedCourtId, setPickedCourtId] = useState<string | null>(null);
  const [changingCourt, setChangingCourt] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useBackButtonModal(open, () => onOpenChange(false), `court-slot-${slot?.key ?? 'none'}`);
  useEffect(() => {
    if (!open) {
      setPickedCourtId(null);
      setChangingCourt(false);
    }
  }, [open, slot?.key]);

  const sharers = useMemo(() => sharersForSlot(slot, sharedWith), [slot, sharedWith]);
  const actions = useMemo(
    () =>
      slot
        ? slotSheetActions(slot, { canEdit, canBookHere, shared: sharers.length > 0, canVerify, providerCapabilities })
        : [],
    [slot, canEdit, canBookHere, sharers.length, canVerify, providerCapabilities],
  );

  const title = slot ? slotCourtName(slot, courtsById, t) : t('card.title');
  const described = slot ? describeCourtSlot(slot) : null;
  const pickMode = slot
    ? courtPickMode(slot, { canEdit, canAssignCourt, pickableCourtIds: pickableCourts.map((c) => c.id) })
    : 'none';
  const needsPick = Boolean(slot && slot.courtId == null && slot.state !== 'linked' && canEdit && pickableCourts.length > 0);
  const showPicker = needsPick || (pickMode === 'change' && changingCourt);
  const pickerCourts = pickMode === 'change' ? pickableCourts.filter((c) => c.id !== slot?.courtId) : pickableCourts;
  const pickedCourt = pickedCourtId ? pickerCourts.find((c) => c.id === pickedCourtId) ?? null : null;
  const assignBusy = pendingAction === 'assign_court';

  return (
    <Drawer open={open} onOpenChange={onOpenChange} nested={nested}>
      <DrawerContent
        accessibleTitle={title}
        className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onOpenAutoFocus={(e) => {
          // Land on the court's name, not on the first action (no accidental taps, calm for screen readers).
          e.preventDefault();
          headingRef.current?.focus({ preventScroll: true });
        }}
      >
        <div aria-hidden className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />
        <OverlayKeyboardBody className="min-h-0 flex-1 overflow-y-auto">
          {slot && described ? (
            <>
              <DrawerHeader className="flex items-center justify-between gap-3 px-0 text-start">
                <DrawerTitle ref={headingRef} tabIndex={-1} className="truncate outline-none">
                  {title}
                </DrawerTitle>
                <ReservationPill tone={pillToneForSlot(slot)} label={text.copy(described.label)} linked={slot.state === 'linked'} />
              </DrawerHeader>
              <DrawerDescription className="sr-only">{text.copy(described.label)}</DrawerDescription>

              <SlotTimeline slot={slot} window={window} sharers={sharers} text={text} />

              <dl className="mt-3 space-y-1.5 text-sm">
                {window ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-500 dark:text-gray-400">{t('sheet.game')}</dt>
                    <dd className="tabular-nums text-gray-900 dark:text-white">{clock.range(window.start, window.end)}</dd>
                  </div>
                ) : null}
                {slot.links.map((link) => (
                  <div key={link.id} className="flex justify-between gap-3">
                    <dt className="text-gray-500 dark:text-gray-400">
                      {t('sheet.reservationAt', { provider: providerDisplayName(link.provider) })}
                    </dt>
                    <dd className="tabular-nums text-gray-900 dark:text-white">
                      {link.startMs != null && link.endMs != null ? clock.range(link.startMs, link.endMs) : t('sheet.timeUnknown')}
                    </dd>
                  </div>
                ))}
                {slot.state === 'reported' ? (
                  <p className="text-gray-500 dark:text-gray-400">{t('sheet.reportedHint')}</p>
                ) : null}
                {slot.state === 'planned' ? (
                  <p className="text-gray-500 dark:text-gray-400">{t('sheet.plannedHint')}</p>
                ) : null}
                {described.gaps.map((g) => (
                  <p key={g.params.from as string} className="text-amber-700 dark:text-amber-300">
                    {text.copy(g)}
                  </p>
                ))}
              </dl>

              {sharers.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                  {sharers.map((s) => (
                    <li key={s.gameId}>
                      {t('sheet.alsoUsedBy', { name: s.name, from: clock.time(s.start), to: clock.time(s.end) })}
                    </li>
                  ))}
                </ul>
              ) : null}

              {pickMode === 'change' && !changingCourt ? (
                <button
                  type="button"
                  onClick={() => setChangingCourt(true)}
                  data-slot-action="change_court"
                  className="-ms-2 mt-2 inline-flex min-h-[44px] items-center rounded-full px-2 text-sm font-medium text-primary-700 hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-300 dark:hover:bg-primary-950/40"
                >
                  {t('sheet.action.changeCourt')}
                </button>
              ) : null}

              {showPicker ? (
                <fieldset className="cr-enter mt-4">
                  <legend className="mb-2 text-sm font-medium text-gray-900 dark:text-white">{t('sheet.pickCourt')}</legend>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('sheet.pickCourt')}>
                    {pickerCourts.map((court) => {
                      const selected = pickedCourtId === court.id;
                      return (
                        <button
                          key={court.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setPickedCourtId(selected ? null : court.id)}
                          className={`min-h-[44px] rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                            selected
                              ? 'border-primary-600 bg-primary-600 text-white'
                              : 'border-gray-200 bg-white text-gray-800 hover:border-primary-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'
                          }`}
                        >
                          {court.name}
                        </button>
                      );
                    })}
                  </div>
                  {pickMode !== 'none' && pickedCourt ? (
                    <button
                      type="button"
                      disabled={pendingAction != null}
                      aria-busy={assignBusy || undefined}
                      data-slot-action="assign_court"
                      onClick={() => onAction({ kind: 'assign_court', slot, courtId: pickedCourt.id })}
                      className={`cr-enter mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-[background-color,transform] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-60 enabled:active:scale-[0.98] ${pressScaleGuard} ${
                        pickMode === 'change'
                          ? 'bg-primary-600 text-white hover:bg-primary-700'
                          : 'border border-gray-200 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-white dark:hover:bg-gray-800'
                      }`}
                    >
                      {assignBusy ? <LoaderCircle size={16} aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
                      {pickMode === 'change'
                        ? t('sheet.action.useCourtInstead', { court: pickedCourt.name })
                        : t('sheet.action.useCourtOnly', { court: pickedCourt.name })}
                    </button>
                  ) : null}
                  {pickMode === 'change' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setChangingCourt(false);
                        setPickedCourtId(null);
                      }}
                      className="mt-1 flex min-h-[44px] w-full items-center justify-center rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      {t('sheet.action.keepCourt', { court: title })}
                    </button>
                  ) : null}
                </fieldset>
              ) : null}

              {error ? (
                <p
                  role="alert"
                  data-slot-error=""
                  className="mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
                >
                  {error}
                </p>
              ) : null}

              {actions.length > 0 && !(pickMode === 'change' && changingCourt) ? (
                <div className="mt-5 flex flex-col gap-2">
                  {actions.map((spec) => {
                    const busy = pendingAction === spec.kind;
                    const style = spec.primary
                      ? 'bg-primary-600 text-white hover:bg-primary-700'
                      : spec.destructive
                        ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30'
                        : 'border border-gray-200 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-white dark:hover:bg-gray-800';
                    return (
                      <button
                        key={spec.kind}
                        type="button"
                        disabled={pendingAction != null}
                        aria-busy={busy || undefined}
                        data-slot-action={spec.kind}
                        onClick={() => onAction({ kind: spec.kind, slot, linkId: spec.linkId, courtId: pickedCourtId })}
                        className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-[background-color,transform] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-60 enabled:active:scale-[0.98] ${pressScaleGuard} ${style}`}
                      >
                        {busy ? <LoaderCircle size={16} aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
                        {actionLabel(spec, slot, t)}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </>
          ) : null}
        </OverlayKeyboardBody>
      </DrawerContent>
    </Drawer>
  );
}
