import { describe, expect, it } from 'vitest';
import type { ClubWeeklyHoursDay } from '@shared/clubAdmin/contract';
import {
  buildHoursBody,
  closesNextDay,
  copyMondayToAll,
  hasHoursErrors,
  normalizeWeekly,
  validateHours,
  type ClosureDraft,
} from './hoursModel';
import { dayPriceSegments, parseMoneyInput, resolvePriceAt, resolveRuleAt, timeToRuleMinute, validateRule, type PriceRuleDraft } from './pricingModel';
import { movePhoto, removePhotoAt, samePhotoOrder } from './photoOrder';
import { activityGroupOf, activitySentence } from './activityModel';

const day = (weekday: ClubWeeklyHoursDay['weekday'], open: string, close: string, closed = false): ClubWeeklyHoursDay => ({
  weekday,
  open,
  close,
  closed,
});

const closure = (over: Partial<ClosureDraft>): ClosureDraft => ({
  key: 'k1',
  date: '2026-12-24',
  allDay: true,
  open: '10:00',
  close: '18:00',
  note: '',
  ...over,
});

describe('hours model', () => {
  it('flags closing next day when close <= open', () => {
    expect(closesNextDay('08:00', '23:00')).toBe(false);
    expect(closesNextDay('08:00', '01:00')).toBe(true);
    expect(closesNextDay('08:00', '00:00')).toBe(true);
    expect(closesNextDay('08:00', '08:00')).toBe(true);
    expect(closesNextDay('bad', '01:00')).toBe(false);
  });

  it('normalizes to 7 ordered rows and copies Monday to all', () => {
    const weekly = normalizeWeekly([day(3, '09:00', '21:00'), day(1, '07:00', '01:00')]);
    expect(weekly.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const copied = copyMondayToAll(weekly);
    expect(copied.every((d) => d.open === '07:00' && d.close === '01:00' && !d.closed)).toBe(true);
    expect(copied.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('validates times, closure dates and duplicates', () => {
    const weekly = normalizeWeekly([]);
    weekly[1] = { ...weekly[1], open: '25:00' };
    weekly[2] = { ...weekly[2], closed: true, open: 'x' };
    const errors = validateHours(
      weekly,
      [
        closure({ key: 'a', date: '2026-12-24' }),
        closure({ key: 'b', date: '2026-12-24' }),
        closure({ key: 'c', date: '2026-01-01' }),
        closure({ key: 'd', date: '2026-12-31', allDay: false, close: '' }),
        closure({ key: 'e', date: '' }),
      ],
      '2026-10-07'
    );
    expect(errors.weekly).toEqual({ 2: 'time' });
    expect(errors.closures).toEqual({ b: 'duplicateDate', c: 'pastDate', d: 'time', e: 'date' });
    expect(hasHoursErrors(errors)).toBe(true);
    expect(hasHoursErrors(validateHours(normalizeWeekly([]), [closure({})], '2026-10-07'))).toBe(false);
  });

  it('builds the PUT body: all-day closures have null hours, sorted by date, ids kept', () => {
    const body = buildHoursBody(normalizeWeekly([]), [
      closure({ key: 'n', date: '2026-12-31', allDay: false, open: '10:00', close: '14:00', note: '  NYE ' }),
      closure({ key: 's', id: 's', date: '2026-12-24' }),
    ]);
    expect(body.weekly).toHaveLength(7);
    expect(body.closures).toEqual([
      { id: 's', date: '2026-12-24', open: null, close: null, note: null },
      { date: '2026-12-31', open: '10:00', close: '14:00', note: 'NYE' },
    ]);
  });
});

const rule = (over: Partial<PriceRuleDraft>): PriceRuleDraft => ({
  key: 'r',
  courtId: null,
  label: null,
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  startMinute: 0,
  endMinute: 1440,
  pricePerHourCents: 1000,
  ...over,
});

describe('pricing preview resolution', () => {
  const clubWideEvening = rule({ key: 'eve', startMinute: 18 * 60, endMinute: 23 * 60, pricePerHourCents: 3000 });
  const clubWideDay = rule({ key: 'day', startMinute: 8 * 60, endMinute: 23 * 60, pricePerHourCents: 2000 });
  const court1Day = rule({ key: 'c1', courtId: 'c1', startMinute: 8 * 60, endMinute: 12 * 60, pricePerHourCents: 1500 });

  it('court-specific beats club-wide', () => {
    const rules = [clubWideDay, court1Day];
    expect(resolveRuleAt(rules, 'c1', 1, 9 * 60)?.key).toBe('c1');
    expect(resolveRuleAt(rules, 'c2', 1, 9 * 60)?.key).toBe('day');
    // A club-wide view never sees court rules.
    expect(resolveRuleAt(rules, null, 1, 9 * 60)?.key).toBe('day');
  });

  it('later start wins between rules of the same scope, smaller id breaks ties', () => {
    expect(resolveRuleAt([clubWideDay, clubWideEvening], 'c1', 1, 19 * 60)?.key).toBe('eve');
    expect(resolveRuleAt([clubWideEvening, clubWideDay], 'c1', 1, 10 * 60)?.key).toBe('day');
    const a = rule({ key: 'b-key', id: 'a', pricePerHourCents: 1 });
    const b = rule({ key: 'a-key', id: 'b', pricePerHourCents: 2 });
    expect(resolveRuleAt([b, a], null, 1, 0)?.id).toBe('a');
  });

  it('respects weekdays and the half-open range; falls back to the base rate', () => {
    const weekend = rule({ key: 'we', weekdays: [6, 7], startMinute: 600, endMinute: 720 });
    expect(resolveRuleAt([weekend], null, 5, 650)).toBeNull();
    expect(resolveRuleAt([weekend], null, 6, 720)).toBeNull();
    expect(resolvePriceAt([weekend], 'c1', 1800, 6, 719)).toEqual({ kind: 'rule', ruleKey: 'we', pricePerHourCents: 1000 });
    expect(resolvePriceAt([weekend], 'c1', 1800, 6, 720)).toEqual({ kind: 'base', pricePerHourCents: 1800 });
    expect(resolvePriceAt([weekend], 'c1', null, 6, 720)).toEqual({ kind: 'none' });
  });

  it('builds merged day segments at rule edges', () => {
    const segs = dayPriceSegments([clubWideDay, clubWideEvening, court1Day], 'c1', null, 1);
    expect(segs.map((s) => [s.startMinute, s.endMinute, s.source.kind === 'rule' ? s.source.ruleKey : s.source.kind])).toEqual([
      [0, 480, 'none'],
      [480, 720, 'c1'],
      [720, 1080, 'day'],
      [1080, 1380, 'eve'],
      [1380, 1440, 'none'],
    ]);
    expect(dayPriceSegments([], 'c1', 1200, 1)).toEqual([{ startMinute: 0, endMinute: 1440, source: { kind: 'base', pricePerHourCents: 1200 } }]);
  });

  it('validates rules and parses inputs', () => {
    expect(validateRule(rule({ weekdays: [] }))).toBe('weekdays');
    expect(validateRule(rule({ startMinute: 600, endMinute: 600 }))).toBe('range');
    expect(validateRule(rule({ pricePerHourCents: -1 }))).toBe('price');
    expect(validateRule(rule({}))).toBeNull();
    expect(timeToRuleMinute('00:00', true)).toBe(1440);
    expect(timeToRuleMinute('00:00', false)).toBe(0);
    expect(timeToRuleMinute('18:30', false)).toBe(1110);
    expect(parseMoneyInput('25')).toBe(2500);
    expect(parseMoneyInput('12,5')).toBe(1250);
    expect(parseMoneyInput('1.234')).toBeNull();
    expect(parseMoneyInput('')).toBeNull();
  });
});

describe('photo order', () => {
  const photos = ['a', 'b', 'c', 'd'];
  it('moves forward, backward and clamps', () => {
    expect(movePhoto(photos, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(movePhoto(photos, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(movePhoto(photos, 1, 99)).toEqual(['a', 'c', 'd', 'b']);
    expect(movePhoto(photos, 1, -5)).toEqual(['b', 'a', 'c', 'd']);
    expect(movePhoto(photos, 9, 0)).toEqual(photos);
    expect(photos).toEqual(['a', 'b', 'c', 'd']);
  });

  it('removes and compares order', () => {
    expect(removePhotoAt(photos, 1)).toEqual(['a', 'c', 'd']);
    expect(samePhotoOrder(photos, ['a', 'b', 'c', 'd'])).toBe(true);
    expect(samePhotoOrder(photos, movePhoto(photos, 0, 1))).toBe(false);
  });
});

describe('activity sentences', () => {
  const item = (action: Parameters<typeof activityGroupOf>[0], meta: Record<string, string | number | boolean | null>) => ({
    id: '1',
    action,
    actor: { id: 'u', firstName: 'A', lastName: null, avatar: null },
    createdAt: '2026-10-07T10:00:00Z',
    meta,
  });
  it('picks variants by the meta that is present', () => {
    expect(activitySentence(item('HOLD_CREATED', { court: 'Court 2', count: 3, startTime: '2026-10-08T18:00:00Z' }))).toMatchObject({
      key: 'HOLD_CREATED_court',
      values: { court: 'Court 2', count: 3 },
      startTime: '2026-10-08T18:00:00Z',
    });
    expect(activitySentence(item('GAME_CANCELLED', { game: null })).key).toBe('GAME_CANCELLED');
    expect(activitySentence(item('COURT_UPDATED', { court: 'C', isActive: false })).key).toBe('COURT_UPDATED_inactive');
    expect(activitySentence(item('PAYMENT_RECORDED', { amountCents: 2500, method: 'CASH' }))).toMatchObject({ amountCents: 2500 });
    expect(activityGroupOf('TEAM_ROLE_CHANGED')).toBe('team');
  });
});
