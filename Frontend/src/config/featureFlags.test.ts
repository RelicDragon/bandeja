import { describe, expect, it } from 'vitest';
import { isCostSplitEnabled, isGameSeriesEnabled, isShopEnabled } from './featureFlags';

const READERS = [
  ['isGameSeriesEnabled', isGameSeriesEnabled],
  ['isCostSplitEnabled', isCostSplitEnabled],
  ['isShopEnabled', isShopEnabled],
] as const;

describe('feature flags', () => {
  for (const [name, read] of READERS) {
    describe(name, () => {
      // `undefined` falls through to the `import.meta.env` default, which the
      // build injects as '' — asserted via the explicit '' case below.
      it('defaults to on for a non-string value', () => {
        expect(read(null)).toBe(true);
        expect(read(1)).toBe(true);
        expect(read(false)).toBe(true);
      });

      it('is on for anything that is not an explicit off value', () => {
        expect(read('1')).toBe(true);
        expect(read('true')).toBe(true);
        expect(read('on')).toBe(true);
        expect(read('')).toBe(true);
      });

      it('is off for 0 / false / off, case and whitespace insensitive', () => {
        expect(read('0')).toBe(false);
        expect(read('false')).toBe(false);
        expect(read('off')).toBe(false);
        expect(read(' FALSE ')).toBe(false);
        expect(read('Off')).toBe(false);
      });
    });
  }
});
