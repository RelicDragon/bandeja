import { describe, expect, it } from 'vitest';
import {
  assertScoringMatchesFixture,
  loadScoringGoldenFixtures,
  runScoringFixture,
  runScoringGoldenFixtures,
  SCORING_GOLDEN_MIN_FIXTURES,
} from './scoringGolden.harness';

const fixtures = loadScoringGoldenFixtures();

describe('scoring golden fixtures', () => {
  it('loads the shared catalog', () => {
    expect(fixtures.length).toBe(SCORING_GOLDEN_MIN_FIXTURES);
  });

  it.each(fixtures)('matches golden fixture: $name', (fixture) => {
    const result = runScoringFixture(fixture);
    const err = assertScoringMatchesFixture(result, fixture);
    expect(err, err ?? undefined).toBeNull();
  });

  it('batch runner stays green', () => {
    const { failures } = runScoringGoldenFixtures();
    expect(failures).toEqual([]);
  });
});
