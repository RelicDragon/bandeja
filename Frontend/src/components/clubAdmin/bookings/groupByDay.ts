import type { BookingItem } from '@shared/clubAdmin/contract';
import { clubLocalDate } from '@shared/clubAdmin/clubTime';

export interface BookingDayGroup {
  date: string;
  items: BookingItem[];
}

/**
 * Group bookings by **club-local** start date, preserving list order (upcoming ascending, past
 * descending — whatever the server sent). A late-night booking stays on its club day even when
 * the operator's device is in another zone.
 */
export function groupBookingsByDay(items: BookingItem[], timeZone: string): BookingDayGroup[] {
  const groups: BookingDayGroup[] = [];
  const byDate = new Map<string, BookingDayGroup>();
  for (const item of items) {
    const date = clubLocalDate(new Date(item.startTime), timeZone);
    let g = byDate.get(date);
    if (!g) {
      g = { date, items: [] };
      byDate.set(date, g);
      groups.push(g);
    }
    g.items.push(item);
  }
  return groups;
}
