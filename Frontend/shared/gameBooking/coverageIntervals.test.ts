import { describe, expect, it } from 'vitest';
import {
  MINUTE_MS,
  addMinutesMs,
  clipInterval,
  computeCoverageGaps,
  computeCoverageGapsMs,
  coveredLengthMs,
  intervalMinutes,
  intervalsOverlap,
  isWindowCovered,
  isoIntervalsOverlap,
  mergeIntervals,
  minutesBetween,
  msToMinutes,
  parseInstantMs,
  toMsInterval,
  totalLengthMs,
  unionIsoIntervals,
} from './coverageIntervals';

const T = (hhmm: string) => `2026-06-12T${hhmm}:00.000Z`;
const ms = (hhmm: string) => Date.parse(T(hhmm));
const win = { start: T('10:00'), end: T('12:00') };

describe('parseInstantMs / toMsInterval', () => {
  it('parses ISO instants regardless of offset', () => {
    expect(parseInstantMs('2026-06-12T12:00:00+02:00')).toBe(ms('10:00'));
  });

  it('returns null for missing or garbage instants', () => {
    expect(parseInstantMs(undefined)).toBeNull();
    expect(parseInstantMs(null)).toBeNull();
    expect(parseInstantMs('')).toBeNull();
    expect(parseInstantMs('not a date')).toBeNull();
  });

  it('rejects empty and reversed intervals', () => {
    expect(toMsInterval({ start: T('10:00'), end: T('10:00') })).toBeNull();
    expect(toMsInterval({ start: T('11:00'), end: T('10:00') })).toBeNull();
    expect(toMsInterval({ start: T('10:00'), end: null })).toBeNull();
    expect(toMsInterval(null)).toBeNull();
    expect(toMsInterval({ start: T('10:00'), end: T('11:00') })).toEqual({
      start: ms('10:00'),
      end: ms('11:00'),
    });
  });
});

describe('mergeIntervals', () => {
  it('sorts unsorted input and merges overlaps', () => {
    expect(
      mergeIntervals([
        { start: ms('11:30'), end: ms('12:30') },
        { start: ms('10:00'), end: ms('11:00') },
        { start: ms('10:30'), end: ms('11:45') },
      ]),
    ).toEqual([{ start: ms('10:00'), end: ms('12:30') }]);
  });

  it('merges touching intervals into one', () => {
    expect(
      mergeIntervals([
        { start: ms('11:00'), end: ms('12:00') },
        { start: ms('10:00'), end: ms('11:00') },
      ]),
    ).toEqual([{ start: ms('10:00'), end: ms('12:00') }]);
  });

  it('keeps disjoint intervals separate and drops empty or invalid ones', () => {
    expect(
      mergeIntervals([
        { start: ms('10:00'), end: ms('10:00') },
        { start: ms('12:00'), end: ms('11:00') },
        { start: Number.NaN, end: ms('11:00') },
        { start: ms('11:30'), end: ms('12:00') },
        { start: ms('10:00'), end: ms('11:00') },
      ]),
    ).toEqual([
      { start: ms('10:00'), end: ms('11:00') },
      { start: ms('11:30'), end: ms('12:00') },
    ]);
  });

  it('does not mutate its input', () => {
    const input = [
      { start: ms('11:00'), end: ms('12:00') },
      { start: ms('10:00'), end: ms('11:30') },
    ];
    const copy = JSON.parse(JSON.stringify(input));
    mergeIntervals(input);
    expect(input).toEqual(copy);
  });

  it('unionIsoIntervals returns normalised ISO strings', () => {
    expect(
      unionIsoIntervals([
        { start: '2026-06-12T13:00:00+02:00', end: T('12:00') },
        { start: T('10:00'), end: T('11:00') },
        { start: 'bad', end: T('11:00') },
      ]),
    ).toEqual([{ start: T('10:00'), end: T('12:00') }]);
  });
});

describe('intervalsOverlap', () => {
  const a = { start: ms('10:00'), end: ms('11:00') };

  it('detects partial and containment overlap', () => {
    expect(intervalsOverlap(a, { start: ms('10:30'), end: ms('11:30') })).toBe(true);
    expect(intervalsOverlap(a, { start: ms('09:00'), end: ms('12:00') })).toBe(true);
  });

  it('touching intervals do not overlap', () => {
    expect(intervalsOverlap(a, { start: ms('11:00'), end: ms('12:00') })).toBe(false);
    expect(intervalsOverlap({ start: ms('09:00'), end: ms('10:00') }, a)).toBe(false);
  });

  it('empty intervals never overlap', () => {
    expect(intervalsOverlap(a, { start: ms('10:30'), end: ms('10:30') })).toBe(false);
  });

  it('ISO variant treats invalid input as non-overlapping', () => {
    expect(isoIntervalsOverlap({ start: T('10:00'), end: T('11:00') }, { start: T('10:30'), end: T('12:00') })).toBe(true);
    expect(isoIntervalsOverlap({ start: 'x', end: T('11:00') }, { start: T('10:30'), end: T('12:00') })).toBe(false);
  });
});

describe('clipInterval', () => {
  it('clips to the window and returns null outside it', () => {
    const w = { start: ms('10:00'), end: ms('12:00') };
    expect(clipInterval({ start: ms('09:00'), end: ms('11:00') }, w)).toEqual({ start: ms('10:00'), end: ms('11:00') });
    expect(clipInterval({ start: ms('12:00'), end: ms('13:00') }, w)).toBeNull();
  });
});

describe('computeCoverageGaps', () => {
  it('no gaps when one interval spans the window', () => {
    expect(computeCoverageGaps(win, [{ start: T('09:30'), end: T('12:30') }])).toEqual([]);
  });

  it('back-to-back links cover fully', () => {
    expect(
      computeCoverageGaps(win, [
        { start: T('11:00'), end: T('12:00') },
        { start: T('10:00'), end: T('11:00') },
      ]),
    ).toEqual([]);
  });

  it('a 30-minute hole is a gap', () => {
    expect(
      computeCoverageGaps(win, [
        { start: T('10:00'), end: T('11:00') },
        { start: T('11:30'), end: T('12:00') },
      ]),
    ).toEqual([{ start: T('11:00'), end: T('11:30') }]);
  });

  it('reports leading and trailing gaps', () => {
    expect(computeCoverageGaps(win, [{ start: T('10:30'), end: T('11:30') }])).toEqual([
      { start: T('10:00'), end: T('10:30') },
      { start: T('11:30'), end: T('12:00') },
    ]);
  });

  it('handles unsorted, overlapping input', () => {
    expect(
      computeCoverageGaps(win, [
        { start: T('11:15'), end: T('11:45') },
        { start: T('10:00'), end: T('10:45') },
        { start: T('10:30'), end: T('11:00') },
      ]),
    ).toEqual([
      { start: T('11:00'), end: T('11:15') },
      { start: T('11:45'), end: T('12:00') },
    ]);
  });

  it('intervals entirely outside the window cover nothing', () => {
    expect(
      computeCoverageGaps(win, [
        { start: T('08:00'), end: T('10:00') },
        { start: T('12:00'), end: T('13:00') },
      ]),
    ).toEqual([win]);
  });

  it('zero-length and invalid intervals cover nothing', () => {
    expect(
      computeCoverageGaps(win, [
        { start: T('10:00'), end: T('10:00') },
        { start: 'garbage', end: T('12:00') },
        { start: null, end: null },
      ]),
    ).toEqual([win]);
  });

  it('no intervals means the whole window is a gap', () => {
    expect(computeCoverageGaps(win, [])).toEqual([win]);
  });

  it('an invalid or empty window has no gaps', () => {
    expect(computeCoverageGaps({ start: 'nope', end: T('12:00') }, [])).toEqual([]);
    expect(computeCoverageGaps({ start: T('12:00'), end: T('12:00') }, [])).toEqual([]);
    expect(computeCoverageGapsMs({ start: 5, end: 1 }, [])).toEqual([]);
  });
});

describe('length and minute helpers', () => {
  const w = { start: ms('10:00'), end: ms('12:00') };

  it('coveredLengthMs counts only the covered part of the window', () => {
    expect(coveredLengthMs(w, [{ start: ms('09:00'), end: ms('10:30') }, { start: ms('11:30'), end: ms('13:00') }])).toBe(
      60 * MINUTE_MS,
    );
    expect(coveredLengthMs({ start: 2, end: 1 }, [])).toBe(0);
  });

  it('totalLengthMs counts the merged union', () => {
    expect(totalLengthMs([{ start: ms('10:00'), end: ms('11:00') }, { start: ms('10:30'), end: ms('11:30') }])).toBe(
      90 * MINUTE_MS,
    );
  });

  it('isWindowCovered', () => {
    expect(isWindowCovered(w, [{ start: ms('10:00'), end: ms('12:00') }])).toBe(true);
    expect(isWindowCovered(w, [{ start: ms('10:00'), end: ms('11:59') }])).toBe(false);
    expect(isWindowCovered({ start: 1, end: 1 }, [])).toBe(false);
  });

  it('minute helpers floor and never go negative', () => {
    expect(msToMinutes(90_500)).toBe(1);
    expect(msToMinutes(-5)).toBe(0);
    expect(msToMinutes(Number.NaN)).toBe(0);
    expect(intervalMinutes({ start: ms('10:00'), end: ms('11:30') })).toBe(90);
    expect(minutesBetween(T('10:00'), T('11:15'))).toBe(75);
    expect(minutesBetween(T('11:00'), T('10:00'))).toBe(0);
    expect(minutesBetween('bad', T('10:00'))).toBe(0);
    expect(addMinutesMs(ms('10:00'), 30)).toBe(ms('10:30'));
  });
});
