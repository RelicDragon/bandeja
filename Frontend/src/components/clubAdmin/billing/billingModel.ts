import type { BookingBillingSummary, BookingItem, ChargeSource, ScheduleSlotV2 } from '@shared/clubAdmin/contract';

/** The charge source for a booking, or `null` when it cannot carry a charge (club-system slots). */
export function chargeSourceOf(item: ScheduleSlotV2 | BookingItem): ChargeSource | null {
  if ('type' in item) {
    if (item.type === 'game' || item.type === 'game_court') return { kind: 'game', gameId: item.gameId };
    if (item.type === 'hold') return { kind: 'hold', holdId: item.holdId };
    return null;
  }
  if (item.kind === 'game') return { kind: 'game', gameId: item.gameId };
  if (item.kind === 'hold') return { kind: 'hold', holdId: item.holdId };
  return null;
}

/** Worth a "collect" shortcut: something is owed or could be charged. */
export function isCollectable(billing: BookingBillingSummary | null | undefined): boolean {
  if (!billing) return false;
  if (billing.chargeId) return billing.status === 'UNPAID' || billing.status === 'PARTIAL';
  return (billing.quoteCents ?? 0) > 0;
}
