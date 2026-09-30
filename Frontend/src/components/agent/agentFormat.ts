import type { ResolvedDisplaySettings } from '@/utils/displayPreferences';

/** "Thu 3 Oct, 19:00" in the viewer's locale / 12-24h setting and Home-city timezone. */
export function formatAgentGameWhen(
  iso: string,
  settings: Pick<ResolvedDisplaySettings, 'locale' | 'hour12'>,
  timeZone: string,
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: settings.hour12,
  };
  try {
    return new Intl.DateTimeFormat(settings.locale, { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(settings.locale, options).format(date);
  }
}

/** Short list-row time: time today, weekday this week, else a date. */
export function formatAgentChatTime(iso: string, locale: string, hour12: boolean, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12 }).format(date);
  }
  const days = (now.getTime() - date.getTime()) / 86_400_000;
  if (days >= 0 && days < 6) {
    return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date);
  }
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date);
}
