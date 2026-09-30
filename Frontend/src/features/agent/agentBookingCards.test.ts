import { describe, expect, it } from 'vitest';
import {
  agentBookingCancelMode,
  agentRefToken,
  agentSlotBadge,
  buildBookSlotMessage,
  buildCancelBookingMessage,
  clubTimeZoneLabel,
  durationMinutes,
  formatClubDate,
  formatClubTimeRange,
  groupAgentSlotsByClub,
  parseAgentRefTokens,
  splitAgentSlotEntities,
  stripAgentRefTokens,
  type AgentBookingEntity,
  type AgentSlotEntity,
} from './agentBookingCards';

const fmt = { locale: 'en-GB', hour12: false };

function slot(over: Partial<AgentSlotEntity> = {}): AgentSlotEntity {
  return {
    type: 'slot',
    slotRef: 's1.sig',
    clubId: 'c1',
    clubName: 'X-Padel',
    courtNames: ['Court 1'],
    start: '2026-10-03T17:00:00.000Z',
    end: '2026-10-03T18:30:00.000Z',
    timeZone: 'Europe/Belgrade',
    confidence: 'live',
    asOf: null,
    ...over,
  };
}

function booking(over: Partial<AgentBookingEntity> = {}): AgentBookingEntity {
  return {
    type: 'booking',
    ref: 'bk_1',
    clubId: 'c1',
    clubName: 'X-Padel',
    courtNames: ['Yucatán'],
    start: '2026-10-03T17:00:00.000Z',
    end: '2026-10-03T18:30:00.000Z',
    timeZone: 'Europe/Belgrade',
    provider: 'BOOKTIME',
    state: 'CONFIRMED',
    linkedGameIds: [],
    canCancel: true,
    ...over,
  };
}

const t = (key: string, params?: Record<string, unknown>) => `${key}${params ? JSON.stringify(params) : ''}`;

describe('ref tokens', () => {
  it('parses and strips slot / booking tokens', () => {
    const text = `Book this slot: X, Sat 3 Oct 19:00 ${agentRefToken('slot', 'abc.DEF-_=')}`;
    expect(parseAgentRefTokens(text)).toEqual([{ kind: 'slot', ref: 'abc.DEF-_=' }]);
    expect(stripAgentRefTokens(text)).toBe('Book this slot: X, Sat 3 Oct 19:00');
    expect(parseAgentRefTokens('[booking:weltner:42] cancel')).toEqual([{ kind: 'booking', ref: 'weltner:42' }]);
    expect(stripAgentRefTokens('a [booking:x] b')).toBe('a b');
  });

  it('leaves other brackets alone and drops a truncated trailing token', () => {
    expect(stripAgentRefTokens('see [docs] and [game:1]')).toBe('see [docs] and [game:1]');
    expect(stripAgentRefTokens('Book this slot: X [slot:abc')).toBe('Book this slot: X');
    expect(stripAgentRefTokens('[slot:has space]')).toBe('[slot:has space]');
  });
});

describe('groupAgentSlotsByClub', () => {
  it('groups by club in first-seen order and sorts each group by start', () => {
    const groups = groupAgentSlotsByClub([
      slot({ slotRef: 'b2', clubId: 'b', clubName: 'B', start: '2026-10-03T19:00:00Z' }),
      slot({ slotRef: 'a2', start: '2026-10-03T20:00:00Z' }),
      slot({ slotRef: 'b1', clubId: 'b', clubName: 'B', start: '2026-10-03T18:00:00Z' }),
      slot({ slotRef: 'a1', start: '2026-10-03T08:00:00Z' }),
    ]);
    expect(groups.map((g) => g.clubName)).toEqual(['B', 'X-Padel']);
    expect(groups[0].slots.map((s) => s.slotRef)).toEqual(['b1', 'b2']);
    expect(groups[1].slots.map((s) => s.slotRef)).toEqual(['a1', 'a2']);
  });

  it('splits slots out of an entity list, keeping their position', () => {
    const club = { type: 'club' as const, id: 'c', name: 'C', cityName: null };
    const out = splitAgentSlotEntities([club, slot({ slotRef: '1' }), slot({ slotRef: '2' }), club]);
    expect(out.slots).toHaveLength(2);
    expect(out.others).toHaveLength(2);
    expect(out.slotsIndex).toBe(1);
  });
});

describe('club time zone formatting', () => {
  it('formats in the club tz, not the device tz', () => {
    // 17:00Z = 19:00 in Belgrade (CEST), 00:00 next day in Bangkok.
    expect(formatClubTimeRange('2026-10-03T17:00:00Z', '2026-10-03T18:30:00Z', 'Europe/Belgrade', fmt)).toBe('19:00–20:30');
    expect(formatClubTimeRange('2026-10-03T17:00:00Z', '2026-10-03T18:30:00Z', 'Asia/Bangkok', fmt)).toBe('00:00–01:30');
    expect(formatClubDate('2026-10-03T17:00:00Z', 'Asia/Bangkok', 'en-GB')).toBe('Sun 4 Oct');
    expect(durationMinutes('2026-10-03T17:00:00Z', '2026-10-03T18:30:00Z')).toBe(90);
  });

  it('labels the tz only when the club clock differs from the device', () => {
    expect(clubTimeZoneLabel('2026-10-03T17:00:00Z', 'Europe/Belgrade', 'en-GB', 'Europe/Berlin')).toBeNull();
    expect(clubTimeZoneLabel('2026-10-03T17:00:00Z', 'Europe/Belgrade', 'en-GB', 'Europe/Belgrade')).toBeNull();
    expect(clubTimeZoneLabel('2026-10-03T17:00:00Z', 'Europe/Belgrade', 'en-GB', 'Europe/Moscow')).toBe('CEST');
    expect(clubTimeZoneLabel('2026-10-03T17:00:00Z', 'Asia/Bangkok', 'en-GB', 'Europe/Belgrade')).toMatch(/GMT\+7|ICT/);
  });
});

describe('agentSlotBadge', () => {
  it('never says free for a snapshot', () => {
    expect(agentSlotBadge(slot(), fmt)).toEqual({ key: 'agent.slot.confidence.live', tone: 'positive' });
    expect(agentSlotBadge(slot({ confidence: 'snapshot', asOf: '2026-10-03T12:05:00Z' }), fmt)).toEqual({
      key: 'agent.slot.confidence.snapshot',
      params: { time: '14:05' },
      tone: 'neutral',
    });
    expect(agentSlotBadge(slot({ confidence: 'snapshot', asOf: null }), fmt).key).toBe('agent.slot.confidence.snapshotNoTime');
    expect(agentSlotBadge(slot({ confidence: 'app_only' }), fmt).key).toBe('agent.slot.confidence.appOnly');
  });
});

describe('booking cancel mode', () => {
  it('offers Cancel only when the provider can and the booking is on', () => {
    expect(agentBookingCancelMode(booking())).toBe('cancel');
    expect(agentBookingCancelMode(booking({ state: 'UNKNOWN' }))).toBe('cancel');
    expect(agentBookingCancelMode(booking({ provider: 'WELTNER', canCancel: false }))).toBe('viaClub');
    expect(agentBookingCancelMode(booking({ state: 'CANCELLED' }))).toBe('none');
    expect(agentBookingCancelMode(booking({ state: 'PAST', canCancel: false }))).toBe('none');
  });
});

describe('outgoing messages', () => {
  it('carries the ref as a hidden token after the visible text', () => {
    const book = buildBookSlotMessage(t, slot({ courtNames: ['Court 1', 'Court 2'] }), fmt);
    expect(parseAgentRefTokens(book)).toEqual([{ kind: 'slot', ref: 's1.sig' }]);
    expect(book).toContain('"time":"19:00–20:30"');
    expect(book).toContain('"courts":"Court 1, Court 2"');
    const cancel = buildCancelBookingMessage(t, booking(), fmt);
    expect(parseAgentRefTokens(cancel)).toEqual([{ kind: 'booking', ref: 'bk_1' }]);
    expect(stripAgentRefTokens(cancel).startsWith('agent.booking.cancelMessage')).toBe(true);
  });
});
