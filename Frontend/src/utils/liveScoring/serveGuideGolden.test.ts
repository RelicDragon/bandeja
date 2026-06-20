import { describe, expect, it } from 'vitest';
import {
  assertServeGuideMatchesFixture,
  computeServeGuideFromFixture,
  loadServeGuideGoldenFixtures,
  runServeGuideGoldenFixtures,
  SERVE_GUIDE_GOLDEN_MIN_FIXTURES,
} from './serveGuideGolden.harness';

const fixtures = loadServeGuideGoldenFixtures();

describe('serve guide golden fixtures', () => {
  it('loads the shared catalog', () => {
    expect(fixtures.length).toBe(SERVE_GUIDE_GOLDEN_MIN_FIXTURES);
  });

  it.each(fixtures)('matches golden fixture: $name', (fixture) => {
    const actual = computeServeGuideFromFixture(fixture);
    const err = assertServeGuideMatchesFixture(actual, fixture);
    expect(err, err ?? undefined).toBeNull();
  });

  it('batch runner stays green', () => {
    const { failures } = runServeGuideGoldenFixtures();
    expect(failures).toEqual([]);
  });
});
