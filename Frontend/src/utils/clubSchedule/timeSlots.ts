export const SLOT_MINUTES = 30;

export function resolveSlotMinutes(clubDefault?: number | null): number {
  const n = clubDefault ?? SLOT_MINUTES;
  if (n === 15 || n === 30 || n === 60) return n;
  return SLOT_MINUTES;
}

export function generateTimeSlots(
  openingTime?: string | null,
  closingTime?: string | null,
  slotMinutes: number = SLOT_MINUTES
): string[] {
  const step = resolveSlotMinutes(slotMinutes);
  const open = parseHm(openingTime ?? '07:00');
  const close = parseHm(closingTime ?? '23:00');
  const slots: string[] = [];
  let m = open;
  while (m < close) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
    m += step;
  }
  return slots;
}

function parseHm(value: string): number {
  const [h, min] = value.split(':').map(Number);
  return (h || 0) * 60 + (min || 0);
}

export function slotIndexForTime(time: string, slots: string[]): number {
  const idx = slots.indexOf(time);
  return idx >= 0 ? idx : 0;
}

export function durationToSlotCount(durationHours: number, slotMinutes: number = SLOT_MINUTES): number {
  const step = resolveSlotMinutes(slotMinutes);
  return Math.max(1, Math.round((durationHours * 60) / step));
}
