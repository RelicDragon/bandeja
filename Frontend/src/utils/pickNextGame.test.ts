import { accessSync, constants } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NEXT_GAME_DISPLAY_POLICY, NEXT_GAME_LOOKBACK_MS } from '@shared/nextGame/policy';
import { pickNextGame } from './pickNextGame';
import {
  loadPickNextGameGoldenCatalog,
  PICK_NEXT_GAME_GOLDEN_PATH,
  PICK_NEXT_GAME_REQUIRED_CASES,
  runPickNextGameGoldenCase,
} from './pickNextGame.golden.harness';

describe('pickNextGame', () => {
  const catalog = loadPickNextGameGoldenCatalog();

  it('resolves golden catalog without relying on process.cwd()', () => {
    expect(() => accessSync(PICK_NEXT_GAME_GOLDEN_PATH, constants.R_OK)).not.toThrow();
  });

  it('locks the canonical display policy string', () => {
    expect(catalog.policy).toBe(NEXT_GAME_DISPLAY_POLICY);
    expect(NEXT_GAME_LOOKBACK_MS).toBe(3_600_000);
  });

  it(`covers at least ${catalog.minCases} shared fixture cases`, () => {
    expect(catalog.cases.length).toBeGreaterThanOrEqual(catalog.minCases);
    const names = new Set(catalog.cases.map((c) => c.name));
    for (const required of PICK_NEXT_GAME_REQUIRED_CASES) {
      expect(names.has(required), required).toBe(true);
    }
  });

  it.each(catalog.cases)('golden: $name → $expectedId', (fixture) => {
    expect(runPickNextGameGoldenCase(fixture) ?? null).toBe(fixture.expectedId);
  });

  it('skips invalid startTime values (JS-only; natives reject decode)', () => {
    const ref = new Date('2026-07-14T12:00:00.000Z');
    expect(
      pickNextGame(
        [
          { id: 'bad', startTime: 'not-a-date', status: 'ANNOUNCED' },
          {
            id: 'ok',
            startTime: '2026-07-14T16:00:00.000Z',
            status: 'ANNOUNCED',
          },
        ],
        ref,
      )?.id,
    ).toBe('ok');
  });
});
