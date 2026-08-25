import { describe, expect, it } from 'vitest';
import { resolvePlayIntentCreateLevelRange } from './createGamePlayIntentLevelRange';

describe('resolvePlayIntentCreateLevelRange', () => {
  it('uses host ± band when not from play-intent', () => {
    expect(
      resolvePlayIntentCreateLevelRange({
        fromPlayIntent: false,
        hostDefault: [4.3, 5.7],
      }),
    ).toEqual([4.3, 5.7]);
  });

  it('keeps looking min/max when the play-intent set a band', () => {
    expect(
      resolvePlayIntentCreateLevelRange({
        fromPlayIntent: true,
        initialMin: 2,
        initialMax: 6,
        hostDefault: [4.3, 5.7],
      }),
    ).toEqual([2, 6]);
  });

  it('expands the host band to cover looking roster levels', () => {
    expect(
      resolvePlayIntentCreateLevelRange({
        fromPlayIntent: true,
        hostDefault: [4.3, 5.7],
        rosterLevels: [6.2, 3.9, null],
      }),
    ).toEqual([3.9, 6.2]);
  });

  it('keeps the host band when roster levels are unknown', () => {
    expect(
      resolvePlayIntentCreateLevelRange({
        fromPlayIntent: true,
        hostDefault: [4.3, 5.7],
      }),
    ).toEqual([4.3, 5.7]);
  });
});
