import { describe, expect, it } from 'vitest';
import type { DemandSlot, DemandSlotMember } from '@/api/playIntents';
import {
  demandSlotCreateState,
  demandSlotIntentBody,
  demandSlotStartMinutes,
  demandSlotWhen,
  headlineDemandSlot,
  pickDemandSlotInvitees,
} from './demandSlots';

const TZ = 'Europe/Belgrade';
const TODAY = '2026-10-06';

function member(userId: string, over: Partial<DemandSlotMember> = {}): DemandSlotMember {
  return {
    userId,
    intentId: `i-${userId}`,
    firstName: userId,
    lastName: null,
    avatar: null,
    gender: 'MALE',
    level: 3,
    fitsViewer: true,
    ...over,
  };
}

function slot(over: Partial<DemandSlot> = {}): DemandSlot {
  const members = over.members ?? [member('a'), member('b'), member('c'), member('d', { fitsViewer: false })];
  return {
    key: `${TODAY}:EVENING`,
    dateKey: TODAY,
    period: 'EVENING',
    windowStart: '18:00',
    windowEnd: '24:00',
    count: members.length,
    fitCount: members.filter((m) => m.fitsViewer).length,
    viewerIn: false,
    clubIds: [],
    members,
    ...over,
  };
}

const t = (key: string) =>
  ({ 'playIntent.today': 'Today', 'playIntent.tomorrow': 'Tomorrow', 'playIntent.evening': 'Evening', 'playIntent.morning': 'Morning', 'playIntent.afternoon': 'Afternoon' })[key] ?? key;

describe('demandSlotWhen', () => {
  it('names today, tomorrow, then the weekday', () => {
    expect(demandSlotWhen({ dateKey: TODAY, period: 'EVENING' }, TODAY, t, 'en')).toBe('Today · Evening');
    expect(demandSlotWhen({ dateKey: '2026-10-07', period: 'MORNING' }, TODAY, t, 'en')).toBe('Tomorrow · Morning');
    expect(demandSlotWhen({ dateKey: '2026-10-08', period: 'AFTERNOON' }, TODAY, t, 'en')).toBe('Thu · Afternoon');
  });
});

describe('headlineDemandSlot', () => {
  it('prefers the viewer’s own slot when someone shares it', () => {
    const mine = slot({ key: 'mine', viewerIn: true, members: [member('a')], count: 1, fitCount: 1 });
    expect(headlineDemandSlot([slot(), mine])?.key).toBe('mine');
  });
  it('needs two at the viewer’s level otherwise', () => {
    expect(headlineDemandSlot([slot({ fitCount: 1 })])).toBeNull();
    expect(headlineDemandSlot([slot({ fitCount: 2 })])?.key).toBe(`${TODAY}:EVENING`);
    expect(headlineDemandSlot(undefined)).toBeNull();
  });
});

describe('pickDemandSlotInvitees', () => {
  it('takes party size minus the organizer, in server (fit-first) order', () => {
    expect(pickDemandSlotInvitees(slot(), 4).map((m) => m.userId)).toEqual(['a', 'b', 'c']);
    expect(pickDemandSlotInvitees(slot(), 2).map((m) => m.userId)).toEqual(['a']);
  });
  it('invites only people at the viewer’s level when there are any', () => {
    const s = slot({ members: [member('a'), member('b', { fitsViewer: false })] });
    expect(pickDemandSlotInvitees(s, 4).map((m) => m.userId)).toEqual(['a']);
    const none = slot({ members: [member('x', { fitsViewer: false }), member('y', { fitsViewer: false })] });
    expect(pickDemandSlotInvitees(none, 4).map((m) => m.userId)).toEqual(['x', 'y']);
  });
});

describe('demandSlotStartMinutes', () => {
  it('uses the period default when it is still ahead', () => {
    expect(demandSlotStartMinutes(slot(), TODAY, TZ, new Date('2026-10-06T10:00:00Z'))).toBe(18 * 60);
  });
  it('moves to the next half hour at least an hour out once the default passed', () => {
    // 19:10 Belgrade (UTC+2) → earliest 20:10 → 20:30.
    expect(demandSlotStartMinutes(slot(), TODAY, TZ, new Date('2026-10-06T17:10:00Z'))).toBe(20 * 60 + 30);
  });
  it('ignores the clock for other days', () => {
    expect(
      demandSlotStartMinutes(slot({ dateKey: '2026-10-07' }), TODAY, TZ, new Date('2026-10-06T21:00:00Z')),
    ).toBe(18 * 60);
  });
});

describe('demandSlotCreateState', () => {
  const now = new Date('2026-10-06T10:00:00Z');

  it('invites with intent links when the viewer is not looking in the slot', () => {
    const state = demandSlotCreateState({
      slot: slot({ clubIds: ['club-1'] }),
      partySize: 4,
      sport: 'PADEL',
      timezone: TZ,
      todayKey: TODAY,
      viewerIntentId: null,
      viewerLevel: 3.2,
      now,
    });
    expect(state.playIntentSource).toBeUndefined();
    expect(state.invitedPlayerIds).toEqual(['a', 'b', 'c']);
    expect(state.invitePlayIntentIds).toEqual({ a: 'i-a', b: 'i-b', c: 'i-c' });
    expect(state.initialGameData).toMatchObject({
      sport: 'PADEL',
      isPublic: true,
      maxParticipants: 4,
      clubId: 'club-1',
      startTime: '2026-10-06T16:00:00.000Z',
      endTime: '2026-10-06T17:30:00.000Z',
    });
  });

  it('creates as host (DIRECT) when the viewer’s OPEN intent covers the slot', () => {
    const state = demandSlotCreateState({
      slot: slot({ viewerIn: true }),
      partySize: 4,
      sport: 'PADEL',
      timezone: TZ,
      todayKey: TODAY,
      viewerIntentId: 'mine',
      viewerLevel: 3,
      now,
    });
    expect(state.playIntentSource).toEqual({
      type: 'DIRECT',
      hostIntentId: 'mine',
      invitees: [
        { userId: 'a', intentId: 'i-a' },
        { userId: 'b', intentId: 'i-b' },
        { userId: 'c', intentId: 'i-c' },
      ],
    });
    expect(state.invitePlayIntentIds).toBeUndefined();
  });

  it('leaves the club open when members disagree or any club works', () => {
    for (const clubIds of [null, [], ['x', 'y']]) {
      const state = demandSlotCreateState({
        slot: slot({ clubIds }),
        partySize: 4,
        sport: 'PADEL',
        timezone: TZ,
        todayKey: TODAY,
        viewerIntentId: null,
        viewerLevel: 3,
        now,
      });
      expect(state.initialGameData.clubId).toBeUndefined();
    }
  });

  it('widens the level band to cover the roster', () => {
    const state = demandSlotCreateState({
      slot: slot({ members: [member('a', { level: 2 }), member('b', { level: 4.5 })] }),
      partySize: 4,
      sport: 'PADEL',
      timezone: TZ,
      todayKey: TODAY,
      viewerIntentId: null,
      viewerLevel: 3,
      now,
    });
    expect(state.initialGameData.minLevel as number).toBeLessThanOrEqual(2);
    expect(state.initialGameData.maxLevel as number).toBeGreaterThanOrEqual(4.5);
  });
});

describe('demandSlotIntentBody', () => {
  it('asks for exactly that day and part of day', () => {
    expect(demandSlotIntentBody(slot(), 'city-1', 'PADEL')).toEqual({
      cityId: 'city-1',
      sport: 'PADEL',
      entityType: 'GAME',
      dateKeys: [TODAY],
      timeOfDay: 'EVENING',
      timeOfDays: ['EVENING'],
    });
  });
});
