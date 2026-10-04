/**
 * Booking / slot entity refs (booking plan §14.7, slice 7j) → escaped Telegram HTML lines
 * under the final answer. Pure; built from tool data only, never from model text.
 *
 *   - booking: club, local time in the **club's** time zone (tz label when it differs from
 *     the user's, or the user's is unknown), courts, provider, state, "can be cancelled".
 *   - slot: grouped by club + club-local date + confidence; each group ends with the
 *     confidence note. A `snapshot` / `app_only` slot is never called free: the notes are
 *     the slot tool's own ("No known conflicts as of HH:MM", "Open the club page to check
 *     live availability").
 *
 * Telegram users can't tap a slot (no signed-ref callbacks: 64-byte limit); they reply in
 * text. Lists are capped (count and characters) with "…and N more"; the caller then adds
 * an "Open in app" handoff.
 */
import type { AgentEntityRef } from '@bandeja/shared/agentContract';
import { agentSlotsT } from '../../agent/i18n/agentSlotsI18n';
import { type AgentBotCopyKey, agentBotT } from './agentBotCopy';
import { escapeTelegramHtml } from './agentTelegramHtml';

type BookingEntity = Extract<AgentEntityRef, { type: 'booking' }>;
type SlotEntity = Extract<AgentEntityRef, { type: 'slot' }>;

export const MAX_BOOKING_ITEMS = 8;
export const MAX_SLOT_ITEMS = 12;
/** HTML characters for the whole block (≥ visible text), well under Telegram's 4096. */
export const ENTITY_BLOCK_MAX_CHARS = 3000;
const CLUB_NAME_MAX = 60;
const COURTS_MAX = 80;

const BOOKING_STATE_KEYS: Record<BookingEntity['state'], AgentBotCopyKey> = {
  CONFIRMED: 'booking.state.CONFIRMED',
  CANCELLED: 'booking.state.CANCELLED',
  PAST: 'booking.state.PAST',
  UNKNOWN: 'booking.state.UNKNOWN',
};

const PROVIDER_NAMES: Record<string, string> = {
  BOOKTIME: 'Booktime',
  PADELOO: 'Padeloo',
  KLIKTEREN: 'Klikteren',
  NSPADELSUPABASE: 'NS Padel',
  WELTNER: 'Weltner',
};

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

/** Intl locale for a bot language (`sr` is Serbian Latin in the app). */
function intlLocale(lang: string): string {
  return lang === 'sr' ? 'sr-Latn' : lang;
}

function safeFormat(options: Intl.DateTimeFormatOptions, lang: string, iso: string): string | null {
  try {
    return new Intl.DateTimeFormat(intlLocale(lang), options).format(new Date(iso));
  } catch {
    try {
      return new Intl.DateTimeFormat('en', options).format(new Date(iso));
    } catch {
      return null;
    }
  }
}

function formatDay(iso: string, timeZone: string, lang: string): string {
  return safeFormat({ timeZone, weekday: 'short', day: 'numeric', month: 'short' }, lang, iso) ?? iso.slice(0, 10);
}

function formatTime(iso: string, timeZone: string, lang: string): string {
  return safeFormat({ timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, lang, iso) ?? iso.slice(11, 16);
}

function dateKey(iso: string, timeZone: string): string {
  return safeFormat({ timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }, 'en-CA', iso) ?? iso.slice(0, 10);
}

/** UTC offset of `timeZone` at `iso`, e.g. "GMT+02:00"; null for an invalid zone. */
function offsetLabel(iso: string, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date(iso));
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * When the daily assistant budget resets (`retryAt`, the next UTC midnight) in the user's zone:
 * "02:00", or "Tue 02:00" when that is another local day than `now`. Unknown / invalid zone →
 * UTC with a " UTC" suffix.
 */
export function formatAgentBotResetTime(iso: string, lang: string, timeZone: string | null | undefined, now: Date = new Date()): string {
  const known = Boolean(timeZone && offsetLabel(iso, timeZone));
  const zone = known ? (timeZone as string) : 'UTC';
  const time = formatTime(iso, zone, lang);
  const sameDay = dateKey(iso, zone) === dateKey(now.toISOString(), zone);
  const weekday = sameDay ? null : safeFormat({ timeZone: zone, weekday: 'short' }, lang, iso);
  const label = weekday ? `${weekday} ${time}` : time;
  return known ? label : `${label} UTC`;
}

/**
 * " (GMT+2)"-style label when the club's zone differs from the user's at that instant
 * (compared by offset, so two zones with the same offset don't get a label), or when the
 * user's zone is unknown.
 */
export function timeZoneSuffix(iso: string, clubTimeZone: string, userTimeZone: string | null): string {
  const club = offsetLabel(iso, clubTimeZone);
  if (!club) return '';
  if (userTimeZone && offsetLabel(iso, userTimeZone) === club) return '';
  const short = club === 'GMT' ? 'GMT' : club.replace(/:00$/, '').replace(/([+-])0(\d)/, '$1$2');
  return ` (${short})`;
}

function courtsText(courtNames: string[]): string {
  return courtNames.length ? clip(courtNames.join(', '), COURTS_MAX) : '';
}

function bookingItem(booking: BookingEntity, lang: string, userTimeZone: string | null): string {
  const tz = booking.timeZone;
  const when =
    `${formatDay(booking.start, tz, lang)}, ${formatTime(booking.start, tz, lang)}–${formatTime(booking.end, tz, lang)}` +
    timeZoneSuffix(booking.start, tz, userTimeZone);
  const head = `📅 <b>${escapeTelegramHtml(clip(booking.clubName || '…', CLUB_NAME_MAX))}</b> · ${escapeTelegramHtml(when)}`;
  const details = [
    courtsText(booking.courtNames),
    PROVIDER_NAMES[booking.provider] ?? booking.provider,
    agentBotT(BOOKING_STATE_KEYS[booking.state], lang),
  ].filter(Boolean);
  if (booking.state === 'CONFIRMED' && booking.canCancel) details.push(agentBotT('booking.cancellable', lang));
  return `${head}\n   ${escapeTelegramHtml(details.join(' · '))}`;
}

/** The confidence note for a slot group. Only `live` may sound certain. */
export function slotConfidenceNote(slot: SlotEntity, lang: string): string {
  if (slot.confidence === 'live') return agentSlotsT(lang, 'note.live');
  if (slot.confidence === 'snapshot') {
    return slot.asOf
      ? agentSlotsT(lang, 'note.snapshot', { time: formatTime(slot.asOf, slot.timeZone, lang) })
      : agentSlotsT(lang, 'note.snapshotMissing');
  }
  return agentSlotsT(lang, 'note.checkLive');
}

type SlotGroup = { key: string; first: SlotEntity; slots: SlotEntity[] };

function groupSlots(slots: SlotEntity[]): SlotGroup[] {
  const groups = new Map<string, SlotGroup>();
  for (const slot of slots) {
    const asOfKey = slot.confidence === 'snapshot' ? (slot.asOf ?? '').slice(0, 16) : '';
    const key = `${slot.clubId}|${dateKey(slot.start, slot.timeZone)}|${slot.confidence}|${asOfKey}`;
    const group = groups.get(key);
    if (group) group.slots.push(slot);
    else groups.set(key, { key, first: slot, slots: [slot] });
  }
  return [...groups.values()];
}

function slotGroupHeader(slot: SlotEntity, lang: string, userTimeZone: string | null): string {
  const day = formatDay(slot.start, slot.timeZone, lang) + timeZoneSuffix(slot.start, slot.timeZone, userTimeZone);
  return `🕒 <b>${escapeTelegramHtml(clip(slot.clubName || '…', CLUB_NAME_MAX))}</b> · ${escapeTelegramHtml(day)}`;
}

function slotLine(slot: SlotEntity, lang: string): string {
  const time = `${formatTime(slot.start, slot.timeZone, lang)}–${formatTime(slot.end, slot.timeZone, lang)}`;
  const courts = courtsText(slot.courtNames);
  return `• ${escapeTelegramHtml(courts ? `${time} · ${courts}` : time)}`;
}

export type EntityTextBlock = {
  /** Escaped HTML, blank-line separated sections; '' when there is nothing to show. */
  html: string;
  /** Bookings + slots left out by the caps ("…and N more" is already in `html`). */
  hidden: number;
};

/** Bookings, then slots, capped by count and by `maxChars`. Other entity types are ignored. */
export function renderEntityTextBlock(
  entities: AgentEntityRef[],
  lang: string,
  options: { userTimeZone?: string | null; maxChars?: number } = {},
): EntityTextBlock {
  const userTimeZone = options.userTimeZone ?? null;
  const maxChars = options.maxChars ?? ENTITY_BLOCK_MAX_CHARS;
  const bookings = entities.filter((e): e is BookingEntity => e.type === 'booking');
  const slots = entities.filter((e): e is SlotEntity => e.type === 'slot');
  const total = bookings.length + slots.length;
  if (total === 0) return { html: '', hidden: 0 };

  // Reserve room for the "…and N more" line.
  const budget = maxChars - 40;
  let used = 0;
  let shown = 0;
  const sections: string[] = [];
  const fits = (text: string) => used + text.length + 1 <= budget;

  const bookingLines: string[] = [];
  for (const booking of bookings.slice(0, MAX_BOOKING_ITEMS)) {
    const item = bookingItem(booking, lang, userTimeZone);
    if (!fits(item)) break;
    bookingLines.push(item);
    used += item.length + 1;
    shown += 1;
  }
  if (bookingLines.length) sections.push(bookingLines.join('\n'));

  let slotsShown = 0;
  let stopped = bookingLines.length < bookings.length;
  for (const group of groupSlots(slots)) {
    if (stopped || slotsShown >= MAX_SLOT_ITEMS) break;
    const header = slotGroupHeader(group.first, lang, userTimeZone);
    const note = `<i>${escapeTelegramHtml(slotConfidenceNote(group.first, lang))}</i>`;
    const lines: string[] = [];
    let groupUsed = header.length + note.length + 3;
    if (used + groupUsed > budget) break;
    for (const slot of group.slots) {
      if (slotsShown >= MAX_SLOT_ITEMS) break;
      const line = slotLine(slot, lang);
      if (used + groupUsed + line.length + 1 > budget) {
        stopped = true;
        break;
      }
      lines.push(line);
      groupUsed += line.length + 1;
      slotsShown += 1;
    }
    if (lines.length === 0) break;
    sections.push([header, ...lines, note].join('\n'));
    used += groupUsed;
    shown += lines.length;
  }

  const hidden = total - shown;
  if (hidden > 0) sections.push(`<i>${escapeTelegramHtml(agentBotT('entity.more', lang, { count: hidden }))}</i>`);
  return { html: sections.join('\n\n'), hidden };
}
