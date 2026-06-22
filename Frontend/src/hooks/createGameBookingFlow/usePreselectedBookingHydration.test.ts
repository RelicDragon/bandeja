import { describe, expect, it } from 'vitest';
import { resolvePreselectedBookingHydration } from './usePreselectedBookingHydration';

const booking = (uuid: string) => ({ uuid }) as never;

describe('resolvePreselectedBookingHydration', () => {
  it('waits while loading', () => {
    expect(
      resolvePreselectedBookingHydration(['a'], [booking('a')], true),
    ).toEqual({ ready: false, records: [] });
  });

  it('hydrates when all deep-linked ids resolve', () => {
    const records = [booking('a'), booking('b')];
    expect(
      resolvePreselectedBookingHydration(['a', 'b'], records, false),
    ).toEqual({ ready: true, records });
  });

  it('does not hydrate partial multi-booking matches', () => {
    expect(
      resolvePreselectedBookingHydration(['a', 'b'], [booking('a')], false),
    ).toEqual({ ready: false, records: [] });
  });

  it('preserves deep-link id order', () => {
    const result = resolvePreselectedBookingHydration(
      ['b', 'a'],
      [booking('a'), booking('b')],
      false,
    );
    expect(result.ready).toBe(true);
    expect(result.records.map((r) => r.uuid)).toEqual(['b', 'a']);
  });
});
