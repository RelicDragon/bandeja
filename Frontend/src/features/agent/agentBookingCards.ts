import type { AgentEntityRef } from '@shared/agentContract';

export type AgentSlotEntity = Extract<AgentEntityRef, { type: 'slot' }>;
export type AgentBookingEntity = Extract<AgentEntityRef, { type: 'booking' }>;

// ---- hidden ref tokens (docs/domains/agent.md "Slot and booking refs in user messages") ----

export type AgentRefTokenKind = 'slot' | 'booking';

/** `[slot:<slotRef>]` / `[booking:<bookingRef>]`; refs are opaque, server-minted, no spaces or `]`. */
const REF_TOKEN_RE = /\[(slot|booking):([^\]\s]{1,512})\]/g;

export function agentRefToken(kind: AgentRefTokenKind, ref: string): string {
  return `[${kind}:${ref}]`;
}

export function parseAgentRefTokens(text: string): { kind: AgentRefTokenKind; ref: string }[] {
  return Array.from(text.matchAll(REF_TOKEN_RE), (m) => ({ kind: m[1] as AgentRefTokenKind, ref: m[2] }));
}

/** User bubbles / previews: the tokens are for the model, never shown. */
export function stripAgentRefTokens(text: string): string {
  if (!text.includes('[')) return text;
  return text
    .replace(REF_TOKEN_RE, '')
    // A server-truncated preview can cut a token in half.
    .replace(/\[(?:slot|booking):[^\]\s]*$/, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

// ---- entity grouping ----

export interface AgentSlotGroup {
  clubId: string;
  clubName: string;
  timeZone: string;
  slots: AgentSlotEntity[];
}

/** Slots grouped by club in first-seen order; each group sorted by start. */
export function groupAgentSlotsByClub(slots: AgentSlotEntity[]): AgentSlotGroup[] {
  const groups = new Map<string, AgentSlotGroup>();
  for (const slot of slots) {
    let group = groups.get(slot.clubId);
    if (!group) {
      group = { clubId: slot.clubId, clubName: slot.clubName, timeZone: slot.timeZone, slots: [] };
      groups.set(slot.clubId, group);
    }
    group.slots.push(slot);
  }
  for (const group of groups.values()) {
    group.slots.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }
  return [...groups.values()];
}

/** Slots go to the picker (rendered where the first slot was); everything else stays a card. */
export function splitAgentSlotEntities(entities: AgentEntityRef[]): {
  slots: AgentSlotEntity[];
  others: AgentEntityRef[];
  slotsIndex: number;
} {
  const slots: AgentSlotEntity[] = [];
  const others: AgentEntityRef[] = [];
  let slotsIndex = -1;
  for (const e of entities) {
    if (e.type === 'slot') {
      if (slotsIndex < 0) slotsIndex = others.length;
      slots.push(e);
    } else {
      others.push(e);
    }
  }
  return { slots, others, slotsIndex };
}

// ---- club time zone formatting ----

export interface ClubTimeFormat {
  locale: string;
  hour12: boolean;
}

function safeFormat(date: Date, locale: string, options: Intl.DateTimeFormatOptions, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, options).format(date);
  }
}

function validDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Thu, 3 Oct" as a wall date in the club's tz. */
export function formatClubDate(iso: string, timeZone: string, locale: string): string {
  const d = validDate(iso);
  if (!d) return '';
  return safeFormat(d, locale, { weekday: 'short', day: 'numeric', month: 'short' }, timeZone);
}

export function formatClubTime(iso: string, timeZone: string, fmt: ClubTimeFormat): string {
  const d = validDate(iso);
  if (!d) return '';
  return safeFormat(d, fmt.locale, { hour: fmt.hour12 ? 'numeric' : '2-digit', minute: '2-digit', hour12: fmt.hour12 }, timeZone);
}

/** "19:00–20:30" in the club's tz (an end past midnight just shows the next-day clock time). */
export function formatClubTimeRange(start: string, end: string, timeZone: string, fmt: ClubTimeFormat): string {
  const s = formatClubTime(start, timeZone, fmt);
  const e = formatClubTime(end, timeZone, fmt);
  return s && e ? `${s}–${e}` : s;
}

/** UTC offset of `timeZone` at `date`, in minutes; null for an unknown zone. */
export function timeZoneOffsetMinutes(date: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
  } catch {
    return null;
  }
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Short tz label ("GMT+2", "CEST") when the club's clock differs from the device's at that
 * instant, so a player abroad does not misread the time; null when they agree.
 */
export function clubTimeZoneLabel(
  iso: string,
  clubTimeZone: string,
  locale: string,
  deviceTz: string = deviceTimeZone(),
): string | null {
  const d = validDate(iso);
  if (!d) return null;
  const club = timeZoneOffsetMinutes(d, clubTimeZone);
  const device = timeZoneOffsetMinutes(d, deviceTz);
  if (club == null || device == null || club === device) return null;
  try {
    const part = new Intl.DateTimeFormat(locale, { timeZone: clubTimeZone, timeZoneName: 'short' })
      .formatToParts(d)
      .find((p) => p.type === 'timeZoneName');
    return part?.value ?? clubTimeZone;
  } catch {
    return clubTimeZone;
  }
}

export function durationMinutes(start: string, end: string): number | null {
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return null;
  return Math.round((e - s) / 60_000);
}

// ---- confidence badge (booking plan §14.3: never "free" from a snapshot) ----

export type AgentSlotBadgeTone = 'positive' | 'neutral' | 'muted';

export interface AgentSlotBadge {
  key: 'agent.slot.confidence.live' | 'agent.slot.confidence.snapshot' | 'agent.slot.confidence.snapshotNoTime' | 'agent.slot.confidence.appOnly';
  params?: { time: string };
  tone: AgentSlotBadgeTone;
}

/** `asOf` is shown in the club's tz, like the slot itself. */
export function agentSlotBadge(slot: AgentSlotEntity, fmt: ClubTimeFormat): AgentSlotBadge {
  switch (slot.confidence) {
    case 'live':
      return { key: 'agent.slot.confidence.live', tone: 'positive' };
    case 'snapshot': {
      const time = slot.asOf ? formatClubTime(slot.asOf, slot.timeZone, fmt) : '';
      return time
        ? { key: 'agent.slot.confidence.snapshot', params: { time }, tone: 'neutral' }
        : { key: 'agent.slot.confidence.snapshotNoTime', tone: 'neutral' };
    }
    default:
      return { key: 'agent.slot.confidence.appOnly', tone: 'muted' };
  }
}

// ---- booking cancel affordance ----

export type AgentBookingCancelMode = 'cancel' | 'viaClub' | 'none';

/** Cancel only for bookings still on; Weltner/Nspadel (`canCancel:false`) point at the club. */
export function agentBookingCancelMode(booking: AgentBookingEntity): AgentBookingCancelMode {
  if (booking.state === 'CANCELLED' || booking.state === 'PAST') return 'none';
  return booking.canCancel ? 'cancel' : 'viaClub';
}

const PROVIDER_NAMES: Record<AgentBookingEntity['provider'], string> = {
  BOOKTIME: 'Booktime',
  PADELOO: 'Padeloo',
  KLIKTEREN: 'Klikteren',
  NSPADELSUPABASE: 'Nspadel',
  WELTNER: 'Weltner',
};

export function agentProviderName(provider: AgentBookingEntity['provider']): string {
  return PROVIDER_NAMES[provider] ?? provider;
}

// ---- outgoing user messages ----

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** Visible sentence + hidden token; the model passes the token's ref to `book_court`. */
export function buildBookSlotMessage(t: Translate, slot: AgentSlotEntity, fmt: ClubTimeFormat): string {
  const text = t('agent.slot.bookMessage', {
    club: slot.clubName,
    date: formatClubDate(slot.start, slot.timeZone, fmt.locale),
    time: formatClubTimeRange(slot.start, slot.end, slot.timeZone, fmt),
    courts: slot.courtNames.join(', '),
  });
  return `${text} ${agentRefToken('slot', slot.slotRef)}`;
}

/** Visible sentence + hidden token; the model passes the token's ref to `cancel_booking`. */
export function buildCancelBookingMessage(t: Translate, booking: AgentBookingEntity, fmt: ClubTimeFormat): string {
  const text = t('agent.booking.cancelMessage', {
    club: booking.clubName,
    date: formatClubDate(booking.start, booking.timeZone, fmt.locale),
    time: formatClubTimeRange(booking.start, booking.end, booking.timeZone, fmt),
  });
  return `${text} ${agentRefToken('booking', booking.ref)}`;
}
