import type { ScheduleSlot } from '@/api/clubAdmin';
import type { BookedCourtSlot } from '@/types';

export type SlotVisualKind =
  | 'free'
  | 'game_confirmed'
  | 'game_planned'
  | 'external'
  | 'hold'
  | 'inactive'
  | 'unassigned';

export function adminSlotKind(slot: ScheduleSlot): SlotVisualKind {
  if (slot.type === 'hold') return 'hold';
  if (slot.type === 'external') return 'external';
  if (slot.type === 'game' && slot.courtId === null) return 'unassigned';
  if (slot.type === 'game' || slot.type === 'game_court') {
    return slot.hasBookedCourt ? 'game_confirmed' : 'game_planned';
  }
  return 'free';
}

export function playerSlotKind(info: {
  hasBookedCourt: boolean;
  clubBooked: boolean;
  holdBlocked?: boolean;
}): SlotVisualKind {
  if (info.holdBlocked || info.clubBooked) return 'external';
  if (info.hasBookedCourt) return 'game_confirmed';
  return 'game_planned';
}

export function slotClassName(kind: SlotVisualKind, selected = false): string {
  const base = 'rounded border text-xs transition-colors ';
  switch (kind) {
    case 'free':
      return base + (selected ? 'border-primary bg-primary/20' : 'border-gray-200 bg-gray-100 dark:bg-gray-800');
    case 'game_confirmed':
      return base + 'border-primary bg-primary text-primary-foreground';
    case 'game_planned':
      return base + 'border-amber-400 bg-amber-100 dark:bg-amber-900/40';
    case 'external':
      return base + 'border-red-400 bg-red-100 dark:bg-red-900/40';
    case 'hold':
      return base + 'border-violet-500 bg-violet-100 dark:bg-violet-900/40 bg-stripes';
    case 'inactive':
      return base + 'border-gray-300 bg-gray-200 opacity-50 dark:border-gray-600 dark:bg-gray-700';
    case 'unassigned':
      return base + 'border-orange-400 bg-orange-100 dark:bg-orange-900/40';
    default:
      return base;
  }
}

export function isHardBusy(slot: BookedCourtSlot): boolean {
  return !!(slot.clubBooked || slot.holdBlocked);
}
