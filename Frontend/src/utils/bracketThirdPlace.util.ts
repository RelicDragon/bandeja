import type { BracketSlotDto } from '@/api/leagues';

export function isThirdPlaceSlot(slot: BracketSlotDto): boolean {
  const kind = slot.slotKind as string;
  if (kind === 'THIRD_PLACE') return true;
  if (slot.slotKey?.startsWith('TP-')) return true;
  const label = (slot.roundLabel ?? '').toLowerCase();
  return label.includes('third');
}
