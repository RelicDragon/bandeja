/**
 * Club console money and report math without a database: the quote engine (rule precedence,
 * past midnight, DST days, partly unpriced), charge status derivation, CSV escaping, report
 * periods, heatmap hour buckets and interval overlap.
 */
import assert from 'node:assert/strict';
import { clubWallTimeToUtc } from '@bandeja/shared/clubAdmin/clubTime';
import { pickRule, quoteCourtTime, sumQuotes, type QuoteRule } from '../clubAdminQuote';
import { chargeBalanceCents, deriveChargeStatus } from '../clubAdminBillingMath';
import { centsToDecimal, csvCell, csvRow } from '../clubAdminCsv';
import { hourBuckets, mergeIntervalsByCourt, mondayWeeks, overlapMs, parseReportPeriod, previousPeriod } from '../clubAdminReportsMath';
import { parsePricingBody } from '../clubAdminPricing.service';

const TZ = 'Europe/Belgrade';
const ALL = [1, 2, 3, 4, 5, 6, 7];
const at = (date: string, hh: number, mm = 0) => clubWallTimeToUtc(date, hh * 60 + mm, TZ);
const quote = (courtId: string | null, start: Date, end: Date, rules: QuoteRule[], fallback: number | null = null) =>
  quoteCourtTime({ courtId, start, end, timezone: TZ, rules, fallbackPricePerHourCents: fallback });

/* --- rule precedence: court-specific > club-wide, then later startMinute ----------------------- */
{
  const rules: QuoteRule[] = [
    { id: 'base', courtId: null, weekdays: ALL, startMinute: 0, endMinute: 1440, pricePerHourCents: 2000 },
    { id: 'peak', courtId: null, weekdays: ALL, startMinute: 18 * 60, endMinute: 22 * 60, pricePerHourCents: 3000 },
    { id: 'c1am', courtId: 'c1', weekdays: ALL, startMinute: 8 * 60, endMinute: 12 * 60, pricePerHourCents: 1000 },
  ];
  assert.equal(pickRule(rules, 19 * 60)?.id, 'peak', 'later start wins among club-wide');
  assert.equal(pickRule(rules, 9 * 60)?.id, 'c1am', 'court-specific beats club-wide');
  // 2026-10-07 is a Wednesday. c1 11–19: 1h@1000 + 6h@2000 + 1h@3000.
  const c1 = quote('c1', at('2026-10-07', 11), at('2026-10-07', 19), rules);
  assert.equal(c1.amountCents, 1000 + 12000 + 3000);
  assert.deepEqual(
    c1.breakdown.map((b) => [b.ruleId, b.minutes]).sort(),
    [['base', 360], ['c1am', 60], ['peak', 60]].sort()
  );
  assert.equal(quote('c2', at('2026-10-07', 11), at('2026-10-07', 19), rules).amountCents, 14000 + 3000, 'other court');
  assert.equal(quote(null, at('2026-10-07', 8), at('2026-10-07', 9), rules).amountCents, 2000, 'no court: club-wide only');
  // Half-hour: rounding once at the end. 25 min @ 1999/h = 832.9 → 833.
  assert.equal(quote('c2', at('2026-10-07', 1), at('2026-10-07', 1, 25), [{ ...rules[0], pricePerHourCents: 1999 }]).amountCents, 833);
}

/* --- weekdays + past midnight + fallback ---------------------------------------------------- */
{
  // 2026-10-10 is a Saturday. Saturday-only rule; Sunday falls back to the court's legacy rate.
  const rules: QuoteRule[] = [{ id: 'sat', courtId: null, weekdays: [6], startMinute: 0, endMinute: 1440, pricePerHourCents: 6000 }];
  const q = quote('c1', at('2026-10-10', 23), at('2026-10-11', 1), rules, 1200);
  assert.equal(q.amountCents, 6000 + 1200, 'Sat 23–24 rule, Sun 00–01 fallback');
  assert.deepEqual(q.breakdown.find((b) => b.ruleId === null), { ruleId: null, minutes: 60, pricePerHourCents: 1200 });
  // No fallback → any unpriced minute makes the whole quote null.
  assert.equal(quote('c1', at('2026-10-10', 23), at('2026-10-11', 1), rules).amountCents, null, 'partly unpriced → null');
  const partial: QuoteRule[] = [{ id: 'am', courtId: null, weekdays: ALL, startMinute: 8 * 60, endMinute: 12 * 60, pricePerHourCents: 1000 }];
  assert.equal(quote('c1', at('2026-10-07', 11), at('2026-10-07', 13), partial).amountCents, null);
  assert.equal(quote('c1', at('2026-10-07', 13), at('2026-10-07', 13), partial).amountCents, 0, 'empty interval');
}

/* --- DST: real minutes are billed ----------------------------------------------------------- */
{
  const flat: QuoteRule[] = [{ id: 'flat', courtId: null, weekdays: ALL, startMinute: 0, endMinute: 1440, pricePerHourCents: 1200 }];
  // 2026-10-25 falls back: local 00:00–06:00 is 7 real hours.
  assert.equal(quote('c1', at('2026-10-25', 0), at('2026-10-25', 6), flat).amountCents, 7 * 1200);
  // 2026-03-29 springs forward: local 00:00–06:00 is 5 real hours.
  assert.equal(quote('c1', at('2026-03-29', 0), at('2026-03-29', 6), flat).amountCents, 5 * 1200);
  // A rule edge inside the skipped hour (02:30) never double-counts the minutes after the gap.
  const split: QuoteRule[] = [
    { id: 'early', courtId: null, weekdays: ALL, startMinute: 0, endMinute: 150, pricePerHourCents: 1000 },
    { id: 'late', courtId: null, weekdays: ALL, startMinute: 150, endMinute: 1440, pricePerHourCents: 2000 },
  ];
  const s = quote('c1', at('2026-03-29', 0), at('2026-03-29', 4), split);
  assert.equal(s.breakdown.reduce((n, b) => n + b.minutes, 0), 180, '3 real hours');
  assert.equal(s.amountCents, 2 * 1000 + 1 * 2000);
  // Spans across midnight into the DST day still sum to the real duration.
  const over = quote('c1', at('2026-10-24', 22), at('2026-10-25', 4), flat);
  assert.equal(over.amountCents, 7 * 1200, '22:00 → 04:00 across fall-back = 7 h');
}

assert.equal(sumQuotes([1000, 2000]), 3000);
assert.equal(sumQuotes([1000, null]), null, 'multi-court game: one unpriced court → no quote');
assert.equal(sumQuotes([]), null, 'no court here → no quote');

/* --- pricing body validation ------------------------------------------------------------------ */
{
  const courts = new Set(['c1']);
  const ok = parsePricingBody(
    {
      currency: 'EUR',
      rules: [{ courtId: 'c1', weekdays: [3, 1, 1], startMinute: 0, endMinute: 1440, pricePerHourCents: 0, label: ' Day ' }],
      billableHoldLabels: ['WALK_IN', 'MAINTENANCE', 'WALK_IN'],
    },
    courts
  );
  assert.deepEqual(ok.rules[0].weekdays, [1, 3]);
  assert.equal(ok.rules[0].label, 'Day');
  assert.deepEqual(ok.billableHoldLabels, ['WALK_IN'], 'MAINTENANCE is never billable');
  const bad = (rule: Record<string, unknown>) => () =>
    parsePricingBody({ currency: 'EUR', rules: [{ courtId: null, weekdays: [1], startMinute: 0, endMinute: 60, pricePerHourCents: 1, ...rule }], billableHoldLabels: [] }, courts);
  assert.throws(bad({ weekdays: [] }));
  assert.throws(bad({ weekdays: [8] }));
  assert.throws(bad({ startMinute: 60, endMinute: 60 }));
  assert.throws(bad({ endMinute: 1441 }));
  assert.throws(bad({ pricePerHourCents: -1 }));
  assert.throws(bad({ pricePerHourCents: 10.5 }));
  assert.throws(bad({ courtId: 'foreign' }));
  assert.throws(() => parsePricingBody({ currency: 'XXX', rules: [], billableHoldLabels: [] }, courts));
  assert.throws(() =>
    parsePricingBody(
      { currency: 'EUR', rules: Array.from({ length: 201 }, () => ({ weekdays: [1], startMinute: 0, endMinute: 1, pricePerHourCents: 1 })), billableHoldLabels: [] },
      courts
    )
  );
}

/* --- charge status ---------------------------------------------------------------------------- */
assert.equal(deriveChargeStatus('UNPAID', 3000, 0), 'UNPAID');
assert.equal(deriveChargeStatus('UNPAID', 3000, 1000), 'PARTIAL');
assert.equal(deriveChargeStatus('PARTIAL', 3000, 3000), 'PAID');
assert.equal(deriveChargeStatus('PAID', 3000, 1000), 'PARTIAL', 'voiding a payment reopens');
assert.equal(deriveChargeStatus('UNPAID', 0, 0), 'PAID', 'a zero charge is settled');
assert.equal(deriveChargeStatus('WAIVED', 3000, 0), 'WAIVED', 'explicit statuses stick');
assert.equal(deriveChargeStatus('VOID', 3000, 3000), 'VOID');
assert.equal(chargeBalanceCents('PARTIAL', 3000, 1000), 2000);
assert.equal(chargeBalanceCents('WAIVED', 3000, 1000), 0);

/* --- CSV ------------------------------------------------------------------------------------- */
assert.equal(csvCell('=SUM(A1:A2)'), `'=SUM(A1:A2)`);
assert.equal(csvCell('+381 11 000'), `'+381 11 000`);
assert.equal(csvCell('@cmd'), `'@cmd`);
assert.equal(csvCell('-2+3'), `'-2+3`);
assert.equal(csvCell('\tx'), `'\tx`);
assert.equal(csvCell('-12.50'), '-12.50', 'plain numbers are not prefixed');
assert.equal(csvCell(-5), '-5');
assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
assert.equal(csvCell('a,b'), '"a,b"');
assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
assert.equal(csvCell(null), '');
assert.equal(csvRow(['a', 1, null]), 'a,1,\r\n');
assert.equal(centsToDecimal(1205), '12.05');
assert.equal(centsToDecimal(5), '0.05');
assert.equal(centsToDecimal(null), null);

/* --- report periods --------------------------------------------------------------------------- */
assert.deepEqual(parseReportPeriod('2026-01-01', '2026-12-31'), { from: '2026-01-01', to: '2026-12-31', days: 365 });
assert.equal(parseReportPeriod('2028-01-01', '2028-12-31').days, 366, 'leap year allowed');
assert.throws(() => parseReportPeriod('2026-01-01', '2027-01-02'), (e: { data?: { code?: string } }) => e.data?.code === 'clubAdmin.rangeTooLarge');
assert.throws(() => parseReportPeriod('2026-02-02', '2026-02-01'));
assert.throws(() => parseReportPeriod('2026-02-30', '2026-03-01'));
assert.deepEqual(previousPeriod({ from: '2026-03-01', to: '2026-03-31', days: 31 }), { from: '2026-01-29', to: '2026-02-28', days: 31 });
assert.deepEqual(mondayWeeks('2026-10-07', '2026-10-20'), ['2026-10-05', '2026-10-12', '2026-10-19']);

/* --- heatmap buckets: club-local hours, DST, past midnight ------------------------------------ */
{
  const spring = hourBuckets('2026-03-29', { start: at('2026-03-29', 0), end: at('2026-03-29', 6) }, TZ);
  assert.deepEqual(spring.map((b) => b.hour), [0, 1, 3, 4, 5], 'skipped 02:00 has no bucket');
  assert.ok(spring.every((b) => b.weekday === 6), 'Sunday = 6');
  const fall = hourBuckets('2026-10-25', { start: at('2026-10-25', 0), end: at('2026-10-25', 6) }, TZ);
  assert.equal(fall.find((b) => b.hour === 2)!.end - fall.find((b) => b.hour === 2)!.start, 2 * 3_600_000, 'repeated 02:00 = 2 h');
  const late = hourBuckets('2026-10-10', { start: at('2026-10-10', 22), end: at('2026-10-11', 1) }, TZ);
  assert.deepEqual(late.map((b) => [b.weekday, b.hour]), [[5, 22], [5, 23], [6, 0]], 'after midnight is Sunday 00');
}

/* --- per-court unions and overlap --------------------------------------------------------------- */
{
  const t = (h: number) => new Date(Date.UTC(2026, 0, 1, h));
  const merged = mergeIntervalsByCourt(
    [
      { courtId: 'a', start: t(8), end: t(10) },
      { courtId: 'a', start: t(9), end: t(11) },
      { courtId: 'a', start: t(14), end: t(15) },
      { courtId: 'x', start: t(8), end: t(20) },
    ],
    new Set(['a'])
  );
  assert.deepEqual(merged.get('a'), [[t(8).getTime(), t(11).getTime()], [t(14).getTime(), t(15).getTime()]]);
  assert.equal(merged.has('x'), false, 'inactive / foreign courts are ignored');
  assert.equal(overlapMs(merged.get('a'), t(10).getTime(), t(15).getTime()), 2 * 3_600_000);
  assert.equal(overlapMs(merged.get('a'), t(12).getTime(), t(13).getTime()), 0);
}

console.log('clubAdminBillingMath.test.ts: ok');
