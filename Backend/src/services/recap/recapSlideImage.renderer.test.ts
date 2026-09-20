import assert from 'node:assert/strict';

/**
 * House style for backend tests is `ts-node` + `node:assert` — there is no
 * vitest in the backend. Thin shims keep the original spec readable.
 */
function describe(_name: string, body: () => void): void {
  body();
}
function it(name: string, body: () => void): void {
  try {
    body();
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}
function expect(actual: unknown) {
  return {
    toBe: (expected: unknown) => assert.equal(actual, expected),
    toEqual: (expected: unknown) => assert.deepEqual(actual, expected),
    toContain: (needle: string) =>
      assert.ok(String(actual).includes(needle), `expected ${String(actual)} to contain ${needle}`),
    toBeGreaterThan: (n: number) => assert.ok(Number(actual) > n),
    toBeTruthy: () => assert.ok(actual),
    toBeNull: () => assert.equal(actual, null),
    not: {
      toContain: (needle: string) =>
        assert.ok(
          !String(actual).includes(needle),
          `expected ${String(actual)} not to contain ${needle}`,
        ),
      toBe: (expected: unknown) => assert.notEqual(actual, expected),
    },
  };
}

import {
  buildRecapSummaryCardSvg,
  RECAP_CARD_WIDTH,
} from './recapSlideImage.renderer';
import { MONTHLY_RECAP_PAYLOAD_VERSION, type MonthlyRecapPayload } from './recap.types';

/**
 * Regression for the missing RTL guard on the **card** export. The story-slide
 * export already handled `ar`; the save-to-photos card — the one that lands in
 * the camera roll — left-aligned Arabic and kept `letter-spacing` on it, which
 * breaks cursive glyph joining.
 */

const payload: MonthlyRecapPayload = {
  version: MONTHLY_RECAP_PAYLOAD_VERSION,
  monthKey: '2026-08',
  monthStart: '2026-08-01T00:00:00.000Z',
  daysInMonth: 31,
  weekdayOffset: 5,
  variant: 'FULL',
  sports: [],
  totals: {
    games: 12,
    wins: 7,
    losses: 5,
    ties: 0,
    winRatePct: 58,
    playedDays: [1, 5, 9],
    clubs: 2,
    partners: 3,
  },
  streak: { weeks: 3, best: 5 },
  owner: { firstName: 'Ilya', lastName: 'R', avatar: null, isPremium: false },
  slides: [],
};

describe('buildRecapSummaryCardSvg', () => {
  it('anchors the text block to the start edge in LTR', () => {
    const svg = buildRecapSummaryCardSvg(payload, 'en');
    expect(svg).toContain('x="80" y="200" text-anchor="start"');
    expect(svg).not.toContain('direction="rtl"');
    expect(svg).toContain('letter-spacing="6"');
  });

  it('mirrors the block and drops letter-spacing in Arabic', () => {
    const svg = buildRecapSummaryCardSvg(payload, 'ar');
    const endX = RECAP_CARD_WIDTH - 80;
    expect(svg).toContain(`x="${endX}" y="200" text-anchor="end" direction="rtl"`);
    expect(svg).toContain(`x="${endX}" y="310" text-anchor="end" direction="rtl"`);
    expect(svg).toContain(`x="${endX}" y="380" text-anchor="end" direction="rtl"`);
    // Arabic must never be letter-spaced: it disconnects the cursive joins.
    expect(svg).toContain('letter-spacing="0"');
    expect(svg).not.toContain('letter-spacing="6"');
  });

  it('keeps the Latin wordmark tracked but on the same edge', () => {
    const svg = buildRecapSummaryCardSvg(payload, 'ar');
    expect(svg).toContain(
      `x="${RECAP_CARD_WIDTH - 80}" y="1250" text-anchor="end" font-family=`,
    );
    expect(svg).toContain('letter-spacing="8">BANDEJA<');
  });
});

console.log('PASS ' + __filename.split('/').pop());
