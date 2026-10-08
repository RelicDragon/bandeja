/**
 * A game's courts — when, where and whether each court is booked
 * (docs/domains/booking.md "Game page"). On the game page it is `embedded` in
 * Game info's "where" row and in the Edit dialog's "When and where" tab; the
 * stand-alone card (header, "Change") remains for previews.
 *
 * Header: title, the summary pill (several courts) and, for organizers, the
 * one "Change" button that opens the "When and where" editor. One context
 * line: "Tue 13 Oct · 18:00–20:00 · KSC". Then one row per court with one of
 * three states — Booked · Booktime (green, checked at the club), Booked by
 * organizer (sky, their word), Not booked yet (amber) — or "No time yet"
 * while the game has no time (nothing can be booked then).
 *
 * At most ONE main button, chosen from the state: pick a club, set a time,
 * choose the courts to keep (more courts than the roster needs), use the
 * organizer's own booking found at the club, book, or fill a gap. Rows open
 * the court sheet. Notices (club moved a booking, unfinished changes) sit
 * inside the card, above the rows. Players see the same card without actions.
 */
import { useId, type ReactNode } from 'react';
import { ChevronRight, MapPinOff, Pencil, TriangleAlert } from 'lucide-react';
import type { CourtReservationsResult, CourtSlotView } from '@shared/gameBooking/courtReservations';
import { describeCourtSlot, describeReservationSummary, isReservedByReportOnly } from '@shared/gameBooking/reservationCopy';
import type { IsoInterval } from '@shared/gameBooking/coverageIntervals';
import { Card } from '@/components/Card';
import { pressScaleGuard } from '@/components/motion/pressScale';
import './courtReservations.css';
import { ClubFollowUpRow } from './ClubFollowUpRow';
import type { ClubFollowUp } from './clubFollowUps';
import { CoverageBar } from './CoverageBar';
import { courtsCardAction, slotCoverageSegments, type CourtRef, type CourtsCardAction } from './courtReservationsModel';
import { ReservationPill } from './ReservationPill';
import { pillToneForSlot, pillToneForSummary } from './reservationPillTone';
import { cardActionLabel, slotCourtName } from './courtReservationsCopy';
import { useCourtReservationText, type CourtReservationText } from './useCourtReservationText';

/** Which part of the "When and where" editor a tap opens on. */
export type ScheduleFocus = 'club' | 'time' | 'courts';

export type CourtsCardProps = {
  reservations: Pick<CourtReservationsResult, 'slots' | 'summary'>;
  /** Game window; `null` when the game has no time yet. */
  window: IsoInterval | null;
  courtsById: Readonly<Record<string, CourtRef>>;
  timeZone: string;
  /** Courts the roster needs (players ÷ players per court). */
  courtNeed: number;
  playerCount: number;
  clubName?: string | null;
  /** The game has a club (courts come from it). */
  hasClub: boolean;
  canEdit: boolean;
  /** Organizers: open the "When and where" editor. */
  onChange?: (focus?: ScheduleFocus) => void;
  followUps?: readonly ClubFollowUp[];
  onSlotPress?: (slot: CourtSlotView) => void;
  /** Book / fill a gap / use own booking (the card's main button for those). */
  onAction?: (action: CourtsCardAction) => void;
  onFollowUpDone?: (id: string) => void;
  primaryBusy?: boolean;
  /** Slots whose court the organizer already booked at the club (found in their account). */
  ownBookingSlotKeys?: ReadonlySet<string>;
  providerName?: string;
  /** Per-slot warning (the club moved or dropped its booking). */
  slotNotices?: Readonly<Record<string, string>>;
  /** Card-level notices (an unfinished change), above the rows. */
  notices?: ReactNode;
  /**
   * Inside another card (the game page's Game info, the "When and where" tab):
   * just the notices, rows, follow-ups and the main button — the host already
   * shows when and where, and editing lives in its editor.
   */
  embedded?: boolean;
  /** Off while the host shows a better answer (a court the club shows taken, in the editor). */
  showAction?: boolean;
  className?: string;
};

function SlotRow({
  slot,
  window,
  courtsById,
  text,
  interactive,
  notice,
  onPress,
}: {
  slot: CourtSlotView;
  window: IsoInterval | null;
  courtsById: Readonly<Record<string, CourtRef>>;
  text: CourtReservationText;
  interactive: boolean;
  notice?: string;
  onPress?: (slot: CourtSlotView) => void;
}) {
  const name = slotCourtName(slot, courtsById, text.t);
  const described = describeCourtSlot(slot);
  const noTime = window == null && slot.state === 'planned';
  const stateLabel = noTime ? text.t('slot.noTime') : text.copy(described.label);
  const segments = window ? slotCoverageSegments(slot, window) : null;
  const gapLines = window ? described.gaps.map((g) => text.copy(g)) : [];
  const accessibleName = [name, stateLabel, ...gapLines, ...(notice ? [notice] : [])].join(', ');
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-gray-900 dark:text-white">{name}</span>
          <ReservationPill
            size="compact"
            tone={noTime ? 'noTime' : pillToneForSlot(slot)}
            label={stateLabel}
            linked={slot.state === 'linked'}
          />
        </span>
        {segments && slot.state === 'linked' ? (
          <CoverageBar className="mt-2" window={window} reserved={segments.reserved} gaps={segments.gaps} />
        ) : null}
        {gapLines.length > 0 ? (
          <span className="mt-1 block text-[11px] leading-snug text-amber-700 dark:text-amber-300">{gapLines.join(' · ')}</span>
        ) : null}
        {notice ? (
          <span className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-amber-700 dark:text-amber-300">
            <TriangleAlert size={12} aria-hidden className="mt-px shrink-0" />
            {notice}
          </span>
        ) : null}
      </span>
      {interactive ? <ChevronRight size={16} aria-hidden className="shrink-0 text-gray-400 rtl:rotate-180 dark:text-gray-500" /> : null}
    </>
  );
  if (!interactive) {
    return (
      <li data-slot-key={slot.key} className="flex min-h-[52px] items-center gap-3 px-2.5 py-2">
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
        className={`flex min-h-[52px] w-full items-center gap-3 rounded-xl px-2.5 py-2 text-start transition-[background-color,transform] duration-150 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 active:scale-[0.99] dark:hover:bg-gray-800/60 ${pressScaleGuard}`}
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
  courtNeed,
  playerCount,
  clubName,
  hasClub,
  canEdit,
  onChange,
  followUps = [],
  onSlotPress,
  onAction,
  onFollowUpDone,
  primaryBusy = false,
  ownBookingSlotKeys,
  providerName = '',
  slotNotices,
  notices,
  embedded = false,
  showAction = true,
  className,
}: CourtsCardProps) {
  const text = useCourtReservationText(timeZone);
  const { t, clock } = text;
  const headingId = useId();
  const summary = reservations.summary;
  const slots = reservations.slots;
  const several = Math.max(courtNeed, slots.length) > 1;
  const action = courtsCardAction(reservations, { canEdit, hasClub, hasTime: window != null, courtNeed, ownBookingSlotKeys });
  const when = window ? `${clock.day(window.start)} · ${clock.range(window.start, window.end)}` : t('card.noDateTime');
  const context = [when, hasClub ? clubName || null : null, several ? t('card.players', { count: playerCount }) : null]
    .filter(Boolean)
    .join(' · ');
  const progress = summary.total > 0 ? summary.reserved / summary.total : 0;
  const interactive = canEdit && Boolean(onSlotPress);
  const visibleFollowUps = canEdit ? followUps : [];
  const tooMany = hasClub && slots.length > courtNeed;

  const runAction = (a: CourtsCardAction) => {
    if (a.kind === 'pick_club') onChange?.('club');
    else if (a.kind === 'set_time') onChange?.('time');
    else if (a.kind === 'choose_courts') onChange?.('courts');
    else onAction?.(a);
  };

  const content = (
    <>
      {notices ? <div className="mt-2 flex flex-col gap-2">{notices}</div> : null}

      {!hasClub ? (
        embedded ? (
          <p className="pt-1 text-sm italic text-gray-500 dark:text-gray-400">{t('card.noClub')}</p>
        ) : <p className="mt-2 flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2.5 text-sm text-gray-600 dark:bg-gray-800/60 dark:text-gray-300">
          <MapPinOff size={16} aria-hidden className="shrink-0" />
          {t('card.noClub')}
        </p>
      ) : (
        <ul className={`mt-1.5 flex flex-col ${embedded ? '-mx-2.5' : ''}`}>
          {slots.map((slot) => (
            <SlotRow
              key={slot.key}
              slot={slot}
              window={window}
              courtsById={courtsById}
              text={text}
              interactive={interactive}
              notice={slotNotices?.[slot.key]}
              onPress={onSlotPress}
            />
          ))}
        </ul>
      )}

      {tooMany ? (
        <p className={`mt-1 flex items-start gap-2 text-xs ${embedded ? '' : 'px-2.5'} leading-snug text-amber-700 dark:text-amber-300`} data-testid="courts-card-too-many">
          <TriangleAlert size={14} aria-hidden className="mt-px shrink-0" />
          {t('card.tooMany', { players: playerCount, count: courtNeed })}
        </p>
      ) : null}

      {visibleFollowUps.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1.5" aria-label={t('followUp.title')}>
          {visibleFollowUps.map((f) => (
            <ClubFollowUpRow key={f.id} followUp={f} text={text} courtsById={courtsById} onDone={onFollowUpDone} />
          ))}
        </ul>
      ) : null}

      {action && showAction ? (
        <div key={action.kind} className="cr-enter">
          <button
            type="button"
            disabled={primaryBusy}
            onClick={() => runAction(action)}
            data-primary-action={action.kind}
            className={`mt-2 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white shadow-xs transition-[background-color,transform] duration-150 hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:opacity-60 enabled:active:scale-[0.98] dark:focus-visible:ring-offset-gray-900 ${pressScaleGuard}`}
          >
            {cardActionLabel(action, text, { courtsById, slots, providerName })}
          </button>
        </div>
      ) : null}
    </>
  );

  if (embedded) {
    return (
      <div className={className} data-testid="courts-card" data-embedded="">
        {content}
      </div>
    );
  }

  return (
    <Card className={`p-3 ${className ?? ''}`} role="region" aria-labelledby={headingId} data-testid="courts-card">
      <div className="flex items-center justify-between gap-2 ps-1">
        <h3 id={headingId} className="text-base font-semibold text-gray-900 dark:text-white">
          {several ? t('card.titleMany') : t('card.titleOne')}
        </h3>
        <span className="flex items-center gap-1">
          {hasClub && window && slots.length > 1 ? (
            <ReservationPill
              tone={pillToneForSummary(summary, slots)}
              label={text.copy(describeReservationSummary(summary, { reportedOnly: isReservedByReportOnly(slots) }))}
              progress={progress}
            />
          ) : null}
          {canEdit && onChange ? (
            <button
              type="button"
              onClick={() => onChange()}
              data-testid="courts-card-change"
              className="inline-flex min-h-[44px] items-center gap-1 rounded-full px-3 text-sm font-medium text-primary-700 hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-300 dark:hover:bg-primary-950/40"
            >
              <Pencil size={14} aria-hidden />
              {t('card.change')}
            </button>
          ) : null}
        </span>
      </div>
      <p className="mt-0.5 px-1 text-xs tabular-nums text-gray-500 dark:text-gray-400" data-testid="courts-card-context">
        {context}
      </p>

      {content}
    </Card>
  );
}
