/**
 * What happens to each court when a game with bookings moves (inside the
 * "When and where" editor): one calm row per court that changes — the chosen
 * outcome, one plain sentence with the real cause, and a quiet "Change" that
 * opens the alternatives as a radio list. A clash row is red with a one-tap
 * fix. Courts where nothing happens collapse into one line
 * ({@link RescheduleOutcomeList}).
 */
import { useState } from 'react';
import { Bell, ChevronDown, TriangleAlert, Wand2 } from 'lucide-react';
import type { CourtSlotView } from '@shared/gameBooking/courtReservations';
import type { SharedGameRef, SlotPlanOption } from '@shared/gameBooking/planReschedule';
import type { ProviderCapabilityOverrides } from '@shared/gameBooking/providerCapabilities';
import type { IsoInterval } from '@shared/gameBooking/coverageIntervals';
import { describeRescheduleOutcome } from '@shared/gameBooking/reservationCopy';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { slotCourtName } from './courtReservationsCopy';
import type { CourtRef } from './courtReservationsModel';
import type { ClashFix, EffectiveSlotPlan } from './rescheduleChoices';
import { isQuietSlot, optionLabel, slotSentence, type SlotSentenceContext } from './rescheduleCopy';
import type { ReschedulePlanState } from './useReschedulePlan';
import type { CourtReservationText } from './useCourtReservationText';
import './courtReservations.css';

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

export function OutcomeRow({
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



export function RescheduleOutcomeList({
  planner,
  slots,
  courtsById,
  sharedWith,
  providerCapabilities,
  playerCount,
  text,
}: {
  planner: ReschedulePlanState;
  slots: readonly CourtSlotView[];
  courtsById: Readonly<Record<string, CourtRef>>;
  sharedWith?: Readonly<Record<string, readonly SharedGameRef[] | undefined>>;
  providerCapabilities?: ProviderCapabilityOverrides;
  playerCount: number;
  text: CourtReservationText;
}) {
  const { t } = text;
  const { effective } = planner;
  const window: IsoInterval = planner.newWindow;
  const sentenceBase = { courts: courtsById, text, window, sharedWith, providerCapabilities };
  const loud = effective.slots.filter((s) => !isQuietSlot(s));
  const quiet = effective.slots.filter((s) => isQuietSlot(s));
  const viewOf = (slotKey: string) => slots.find((s) => s.key === slotKey) ?? null;
  const nameOf = (slotKey: string) => {
    const view = viewOf(slotKey);
    return view ? slotCourtName(view, courtsById, t) : t('card.anyCourt');
  };
  if (!effective.windowChanged) return null;
  return (
    <section className="space-y-2" data-testid="schedule-bookings-move" aria-label={t('move.courtsLabel')}>
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{t('move.courtsLabel')}</p>
      <ul className="flex flex-col gap-2">
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
      {playerCount > 0 ? (
        <p className="flex items-center gap-2 px-1 text-xs text-gray-500 dark:text-gray-400">
          <Bell size={14} aria-hidden className="shrink-0" />
          {t('move.notice', { count: playerCount })}
        </p>
      ) : null}
    </section>
  );
}
