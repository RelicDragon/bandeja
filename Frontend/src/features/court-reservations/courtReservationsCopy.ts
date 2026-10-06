/**
 * Small text/selection helpers shared by the card, the sheets and the rows
 * (kept out of the .tsx files so those export components only).
 */
import type { CourtSlotView } from '@shared/gameBooking/courtReservations';
import type { SharedGameRef } from '@shared/gameBooking/planReschedule';
import { providerDisplayName } from '@shared/gameBooking/reservationCopy';
import type { ClubFollowUp } from './clubFollowUps';
import type { CourtRef, CourtsCardAction, CourtsPrimaryAction } from './courtReservationsModel';
import type { CourtReservationText } from './useCourtReservationText';

export function slotCourtName(
  slot: Pick<CourtSlotView, 'effectiveCourtId'>,
  courtsById: Readonly<Record<string, CourtRef>>,
  t: CourtReservationText['t'],
): string {
  return (slot.effectiveCourtId && courtsById[slot.effectiveCourtId]?.name) || t('card.anyCourt');
}

/** The Courts card's main button. */
export function cardActionLabel(
  action: CourtsCardAction,
  text: CourtReservationText,
  ctx: { courtsById: Readonly<Record<string, CourtRef>>; slots: readonly CourtSlotView[]; providerName: string },
): string {
  const { t } = text;
  switch (action.kind) {
    case 'pick_club':
      return t('action.pickClub');
    case 'set_time':
      return t('action.setTime');
    case 'choose_courts':
      return t('action.chooseCourts');
    case 'use_own':
      return ctx.providerName ? t('action.useOwn', { provider: ctx.providerName }) : t('action.useOwnPlain');
    case 'reserve': {
      if (action.count === 1) {
        const slot = ctx.slots.find((s) => action.slotKeys.includes(s.key));
        const court = slot?.effectiveCourtId ? ctx.courtsById[slot.effectiveCourtId]?.name : null;
        return court ? t('action.bookCourt', { court }) : t('action.bookAnyCourt');
      }
      return action.remaining ? t('action.bookMore', { count: action.count }) : t('action.bookCourts', { count: action.count });
    }
    case 'fill_gap':
      return primaryActionLabel(action, text);
  }
}

export function primaryActionLabel(action: CourtsPrimaryAction, text: CourtReservationText): string {
  const { t } = text;
  if (action.kind === 'reserve') {
    if (action.remaining) {
      return action.count === 1 ? t('action.reserveLast') : t('action.reserveRemaining', { count: action.count });
    }
    return action.count === 1 ? t('action.reserveCourt') : t('action.reserveCourts', { count: action.count });
  }
  return action.gapCount > 1 ? t('action.fillGaps') : t('action.fillGap', { duration: text.duration(action.minutes) });
}

export function clubFollowUpText(
  followUp: ClubFollowUp,
  text: CourtReservationText,
  courtsById: Readonly<Record<string, CourtRef>>,
): string {
  const { t, clock } = text;
  const court = followUp.courtId ? courtsById[followUp.courtId]?.name ?? t('card.anyCourt') : t('card.anyCourt');
  const provider = providerDisplayName(followUp.provider) || t('followUp.theClub');
  const from = followUp.start ? clock.time(followUp.start) : '';
  const to = followUp.end ? clock.time(followUp.end) : '';
  switch (followUp.reason) {
    case 'cancel_old':
      return from ? t('followUp.cancelOldAt', { time: from }) : t('followUp.cancelOld');
    case 'ask_club':
      return from && to ? t('followUp.askClub', { court, from, to }) : t('followUp.askClubNoTime', { court });
    case 'left_at_club':
      return from && to ? t('followUp.leftAtClub', { court, from, to, provider }) : t('followUp.leftAtClubNoTime', { court, provider });
  }
}

export function sharersForSlot(
  slot: Pick<CourtSlotView, 'links'> | null,
  sharedWith: Readonly<Record<string, readonly SharedGameRef[] | undefined>> | undefined,
): SharedGameRef[] {
  if (!slot || !sharedWith) return [];
  const byGame = new Map<string, SharedGameRef>();
  for (const link of slot.links) {
    for (const ref of sharedWith[link.id] ?? sharedWith[link.externalBookingId] ?? []) byGame.set(ref.gameId, ref);
  }
  return [...byGame.values()].sort((a, b) => a.start.localeCompare(b.start));
}
