import { dateKeyInTimezone, shiftDayKey } from '@/utils/weatherDayGroups';

/**
 * PRD 358 — Find day shortcuts (Today · Tomorrow · Weekend).
 *
 * A shortcut is a preset over state Find already has (the selected calendar
 * day, plus a day set for Weekend), never a new filter. This module resolves a
 * shortcut into that preset and decides when a preset is no longer what the
 * screen shows. No React, no store: the host applies the result and owns the
 * release.
 *
 * "Today" is decided in the Home-city timezone, the same clock the Find day
 * keys already use for game placement.
 *
 * Tonight was dropped after review: padel days are mostly evenings, so an
 * 18:00 cut on today looked identical to Today almost every time.
 */

export type QuickShortcutKind = 'tomorrow' | 'weekend';
/** `today` is the go-to-today action; it highlights whenever today is the selected day. */
export type QuickShortcutAction = 'today' | QuickShortcutKind;

export const QUICK_SHORTCUT_KINDS: readonly QuickShortcutKind[] = ['tomorrow', 'weekend'];
export const QUICK_SHORTCUT_ACTIONS: readonly QuickShortcutAction[] = ['today', ...QUICK_SHORTCUT_KINDS];

export interface ResolvedQuickShortcut {
  kind: QuickShortcutKind;
  /** Calendar day the shortcut selects; for Weekend, the first weekend day. */
  selectedDay: string;
  /** Weekend only — the day keys listed under the calendar (Saturday and Sunday, from today on). */
  dayKeys?: string[];
}

export interface ResolveQuickShortcutOptions {
  now: Date;
  /** IANA timezone of the viewer's Home city. */
  timezone: string;
}

/** 0 = Sunday … 6 = Saturday, from a `yyyy-MM-dd` key (calendar day, no timezone). */
export function weekdayOfDayKey(dayKey: string): number {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

const SATURDAY = 6;
const SUNDAY = 0;

/** Saturday and Sunday of the current or next weekend, never a day already past. */
export function resolveWeekendDayKeys(todayKey: string): string[] {
  const weekday = weekdayOfDayKey(todayKey);
  if (weekday === SUNDAY) return [todayKey];
  const saturday = weekday === SATURDAY ? todayKey : shiftDayKey(todayKey, SATURDAY - weekday);
  return [saturday, shiftDayKey(saturday, 1)];
}

export function resolveQuickShortcut(
  kind: QuickShortcutKind,
  { now, timezone }: ResolveQuickShortcutOptions,
): ResolvedQuickShortcut {
  const todayKey = dateKeyInTimezone(now, timezone);
  switch (kind) {
    case 'tomorrow':
      return { kind, selectedDay: shiftDayKey(todayKey, 1) };
    case 'weekend': {
      const dayKeys = resolveWeekendDayKeys(todayKey);
      return { kind, selectedDay: dayKeys[0], dayKeys };
    }
  }
}

export interface QuickShortcutShownState {
  view: 'calendar' | 'list';
  selectedDay: string | null;
}

/**
 * Which option the row highlights, read off the calendar itself: whatever
 * day is selected, the row says so. Saturday or Sunday of the coming weekend
 * is Weekend (and lists both days), today is Today, tomorrow is Tomorrow.
 * Nothing highlights in list view or on any other day.
 *
 * The one ambiguity is a weekend day that is also today: then the tap that
 * got here decides. `weekendPinned` is set by the Weekend option and cleared
 * by Today, so Saturday reads as Weekend after tapping Weekend and as Today
 * after tapping Today.
 */
export function resolveActiveQuickShortcut(
  shown: QuickShortcutShownState,
  weekendPinned: boolean,
  { now, timezone }: ResolveQuickShortcutOptions,
): QuickShortcutAction | null {
  if (shown.view !== 'calendar' || !shown.selectedDay) return null;
  const todayKey = dateKeyInTimezone(now, timezone);
  const isToday = shown.selectedDay === todayKey;
  if (resolveWeekendDayKeys(todayKey).includes(shown.selectedDay) && (!isToday || weekendPinned)) {
    return 'weekend';
  }
  if (isToday) return 'today';
  if (shown.selectedDay === shiftDayKey(todayKey, 1)) return 'tomorrow';
  return null;
}

/**
 * A preset applied earlier still means the same thing now. False once the
 * city day rolled over: the pinned weekend no longer describes what is
 * shown, so the host drops the pin.
 */
export function isQuickShortcutCurrent(
  resolved: ResolvedQuickShortcut,
  options: ResolveQuickShortcutOptions,
): boolean {
  const fresh = resolveQuickShortcut(resolved.kind, options);
  if (fresh.selectedDay !== resolved.selectedDay) return false;
  const a = fresh.dayKeys ?? [];
  const b = resolved.dayKeys ?? [];
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

/** `?quick=` deep-link value → kind, or null for anything unknown. */
export function parseQuickShortcutParam(raw: unknown): QuickShortcutKind | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  return (QUICK_SHORTCUT_KINDS as readonly string[]).includes(value)
    ? (value as QuickShortcutKind)
    : null;
}
