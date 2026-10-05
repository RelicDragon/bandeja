/**
 * "Courts" on the game page.
 *
 * Header: title + the summary pill. One quiet context line ("16 players ·
 * 4 courts · X-Padel"). Then one row per court slot: name (or "Any court"),
 * its pill, and a thin bar of the game window showing what is held. At most
 * ONE primary action, chosen from the state ("Reserve 2 remaining courts",
 * "Fill the 30 min gap", or nothing). Rows open the court sheet.
 *
 * Organizers also see "do this at the club" follow-ups. Everyone else gets
 * the same information without any action (rows are not buttons).
 */
import { useId } from 'react';
import { ChevronRight, Minus, Plus } from 'lucide-react';
import type { CourtReservationsResult, CourtSlotView } from '@shared/gameBooking/courtReservations';
import { describeCourtSlot, describeReservationSummary } from '@shared/gameBooking/reservationCopy';
import type { IsoInterval } from '@shared/gameBooking/coverageIntervals';
import { Card } from '@/components/Card';
import { pressScaleGuard } from '@/components/motion/pressScale';
import './courtReservations.css';
import { ClubFollowUpRow } from './ClubFollowUpRow';
import type { ClubFollowUp } from './clubFollowUps';
import { CoverageBar } from './CoverageBar';
import {
  courtsPrimaryAction,
  slotCoverageSegments,
  type CourtRef,
  type CourtsPrimaryAction,
} from './courtReservationsModel';
import { ReservationPill } from './ReservationPill';
import { pillToneForSlot, pillToneForSummary } from './reservationPillTone';
import { primaryActionLabel, slotCourtName } from './courtReservationsCopy';
import { useCourtReservationText, type CourtReservationText } from './useCourtReservationText';

export type CourtsCardProps = {
  reservations: Pick<CourtReservationsResult, 'slots' | 'summary'>;
  /** Game window; `null` when the game has no time yet (bars are hidden). */
  window: IsoInterval | null;
  courtsById: Readonly<Record<string, CourtRef>>;
  timeZone: string;
  /** Roster size shown in the context line (e.g. max participants). */
  playerCount: number;
  clubName?: string | null;
  canEdit: boolean;
  followUps?: readonly ClubFollowUp[];
  onSlotPress?: (slot: CourtSlotView) => void;
  onPrimaryAction?: (action: CourtsPrimaryAction) => void;
  onFollowUpDone?: (id: string) => void;
  /** The primary action is running (spinner-free: the button just disables). */
  primaryBusy?: boolean;
  /**
   * "Number of courts − N +" (organizers). `value` is the slot count shown,
   * prefilled from `defaultCourtSlotCount` when the game has no explicit count.
   */
  courtCount?: { value: number; min: number; max: number; busy?: boolean; onChange: (next: number) => void };
  className?: string;
};

function CourtCountStepper({
  value,
  min,
  max,
  busy,
  onChange,
  text,
}: NonNullable<CourtsCardProps['courtCount']> & { text: CourtReservationText }) {
  const { t } = text;
  const btn =
    'flex h-11 w-11 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-40 dark:text-gray-200 dark:hover:bg-gray-700';
  return (
    <div className="mt-1 flex items-center justify-between gap-3 px-2.5" data-testid="court-count-stepper">
      <span className="text-sm text-gray-600 dark:text-gray-300">{t('card.count')}</span>
      <span className="flex items-center gap-1">
        <button type="button" className={btn} aria-label={t('card.fewer')} disabled={busy || value <= min} onClick={() => onChange(value - 1)}>
          <Minus size={16} aria-hidden />
        </button>
        <span className="w-6 text-center text-sm font-semibold tabular-nums text-gray-900 dark:text-white" aria-live="polite">
          {value}
        </span>
        <button type="button" className={btn} aria-label={t('card.more')} disabled={busy || value >= max} onClick={() => onChange(value + 1)}>
          <Plus size={16} aria-hidden />
        </button>
      </span>
    </div>
  );
}

function SlotRow({
  slot,
  window,
  courtsById,
  text,
  interactive,
  onPress,
}: {
  slot: CourtSlotView;
  window: IsoInterval | null;
  courtsById: Readonly<Record<string, CourtRef>>;
  text: CourtReservationText;
  interactive: boolean;
  onPress?: (slot: CourtSlotView) => void;
}) {
  const described = describeCourtSlot(slot);
  const name = slotCourtName(slot, courtsById, text.t);
  const segments = window ? slotCoverageSegments(slot, window) : null;
  const gapLines = described.gaps.map((g) => text.copy(g));
  const stateLabel = text.copy(described.label);
  // Court + state (+ gaps): the row's visible text, joined so a screen reader hears it as one name.
  const accessibleName = [name, stateLabel, ...gapLines].join(', ');
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-gray-900 dark:text-white">{name}</span>
          <ReservationPill
            size="compact"
            tone={pillToneForSlot(slot)}
            label={stateLabel}
            linked={slot.state === 'linked'}
          />
        </span>
        {segments ? (
          <CoverageBar
            className="mt-2"
            window={window}
            reserved={segments.reserved}
            gaps={segments.gaps}
            planned={slot.state === 'planned'}
          />
        ) : null}
        {gapLines.length > 0 ? (
          <span className="mt-1 block text-[11px] leading-snug text-amber-700 dark:text-amber-300">
            {gapLines.join(' · ')}
          </span>
        ) : null}
      </span>
      {interactive ? (
        <ChevronRight size={16} aria-hidden className="shrink-0 text-gray-400 rtl:rotate-180 dark:text-gray-500" />
      ) : null}
    </>
  );
  if (!interactive) {
    return (
      <li data-slot-key={slot.key} className="flex min-h-[56px] items-center gap-3 px-2.5 py-2">
        {body}
      </li>
    );
  }
  return (
    <li data-slot-key={slot.key}>
      <button
        type="button"
        aria-label={accessibleName}
        onClick={() => onPress?.(slot)}
        className={`flex min-h-[56px] w-full items-center gap-3 rounded-xl px-2.5 py-2 text-start transition-[background-color,transform] duration-150 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 active:scale-[0.99] dark:hover:bg-gray-800/60 ${pressScaleGuard}`}
      >
        {body}
      </button>
    </li>
  );
}

export function CourtsCard({
  reservations,
  window,
  courtsById,
  timeZone,
  playerCount,
  clubName,
  canEdit,
  followUps = [],
  onSlotPress,
  onPrimaryAction,
  onFollowUpDone,
  primaryBusy = false,
  courtCount,
  className,
}: CourtsCardProps) {
  const text = useCourtReservationText(timeZone);
  const { t } = text;
  const headingId = useId();
  const summary = reservations.summary;
  const action = courtsPrimaryAction(reservations, { canEdit });
  const context = [
    t('card.players', { count: playerCount }),
    t('card.courts', { count: reservations.slots.length }),
    clubName || null,
  ]
    .filter(Boolean)
    .join(' · ');
  const progress = summary.total > 0 ? summary.reserved / summary.total : 0;
  const interactive = canEdit && Boolean(onSlotPress);
  const visibleFollowUps = canEdit ? followUps : [];

  return (
    <Card className={`p-3 ${className ?? ''}`} role="region" aria-labelledby={headingId} data-testid="courts-card">
      <div className="flex items-center justify-between gap-3 px-1">
        <h3 id={headingId} className="text-base font-semibold text-gray-900 dark:text-white">
          {t('card.title')}
        </h3>
        <ReservationPill
          tone={pillToneForSummary(summary)}
          label={text.copy(describeReservationSummary(summary))}
          progress={progress}
        />
      </div>
      <p className="mt-0.5 px-1 text-xs text-gray-500 dark:text-gray-400">{context}</p>
      {!window ? (
        <p className="mt-1 px-1 text-xs text-gray-500 dark:text-gray-400">{t('card.noTime')}</p>
      ) : null}

      <ul className="mt-2 flex flex-col">
        {reservations.slots.map((slot) => (
          <SlotRow
            key={slot.key}
            slot={slot}
            window={window}
            courtsById={courtsById}
            text={text}
            interactive={interactive}
            onPress={onSlotPress}
          />
        ))}
      </ul>

      {canEdit && courtCount ? <CourtCountStepper {...courtCount} text={text} /> : null}

      {visibleFollowUps.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1.5" aria-label={t('followUp.title')}>
          {visibleFollowUps.map((f) => (
            <ClubFollowUpRow key={f.id} followUp={f} text={text} courtsById={courtsById} onDone={onFollowUpDone} />
          ))}
        </ul>
      ) : null}

      {action && onPrimaryAction ? (
        <div key={action.kind} className="cr-enter">
          <button
            type="button"
            disabled={primaryBusy}
            onClick={() => onPrimaryAction(action)}
            data-primary-action={action.kind}
            className={`mt-2 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white shadow-xs transition-[background-color,transform] duration-150 hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:opacity-60 enabled:active:scale-[0.98] dark:focus-visible:ring-offset-gray-900 ${pressScaleGuard}`}
          >
            {primaryActionLabel(action, text)}
          </button>
        </div>
      ) : null}
    </Card>
  );
}
