import { describe, expect, it } from 'vitest';
import type { UseGameFormatResult } from '@/hooks/useGameFormat';
import {
  isPointsTargetSuspended,
  isPointsTotalStepValid,
  isSetStructureStepValid,
} from './gameFormatWizardValidation';

describe('isPointsTargetSuspended', () => {
  it('suspends only timed POINTS matches', () => {
    expect(isPointsTargetSuspended('POINTS', true)).toBe(true);
    expect(isPointsTargetSuspended('POINTS', false)).toBe(false);
    expect(isPointsTargetSuspended('CLASSIC', true)).toBe(false);
    expect(isPointsTargetSuspended('CLASSIC', false)).toBe(false);
  });
});

const stub = (over: Partial<UseGameFormatResult>): UseGameFormatResult =>
  ({
    scoringMode: 'POINTS',
    scoringPreset: 'POINTS_16',
    customPointsTotal: null,
    matchTimerEnabled: false,
    matchTimedCapMinutes: 0,
    ...over,
  }) as UseGameFormatResult;

describe('isPointsTotalStepValid', () => {
  it('timed match without a target is valid', () => {
    expect(
      isPointsTotalStepValid(stub({ matchTimerEnabled: true, matchTimedCapMinutes: 14 })),
    ).toBe(true);
  });

  it('timed match ignores a stale custom target', () => {
    expect(
      isPointsTotalStepValid(
        stub({ matchTimerEnabled: true, matchTimedCapMinutes: 14, customPointsTotal: 50 }),
      ),
    ).toBe(true);
  });

  it('timed match still requires a sane duration', () => {
    expect(isPointsTotalStepValid(stub({ matchTimerEnabled: true, matchTimedCapMinutes: 0 }))).toBe(
      false,
    );
    expect(isPointsTotalStepValid(stub({ matchTimerEnabled: true, matchTimedCapMinutes: 61 }))).toBe(
      false,
    );
  });

  it('untimed rules are unchanged', () => {
    expect(isPointsTotalStepValid(stub({}))).toBe(true);
    expect(isPointsTotalStepValid(stub({ customPointsTotal: 50 }))).toBe(true);
    expect(isPointsTotalStepValid(stub({ scoringPreset: 'BEST_OF_3_21' }))).toBe(true);
    expect(isPointsTotalStepValid(stub({ scoringPreset: 'CLASSIC_BEST_OF_3' }))).toBe(false);
    expect(isPointsTotalStepValid(stub({ customPointsTotal: 0 }))).toBe(false);
  });

  it('classic mode skips the step', () => {
    expect(isPointsTotalStepValid(stub({ scoringMode: 'CLASSIC' }))).toBe(true);
  });
});

describe('isSetStructureStepValid', () => {
  it('keeps the classic structure check', () => {
    expect(
      isSetStructureStepValid(
        stub({ scoringMode: 'CLASSIC', scoringPreset: 'CLASSIC_TIMED' }),
      ),
    ).toBe(true);
    expect(
      isSetStructureStepValid(
        stub({ scoringMode: 'CLASSIC', scoringPreset: 'POINTS_16' }),
      ),
    ).toBe(false);
    expect(
      isSetStructureStepValid(
        stub({
          scoringMode: 'CLASSIC',
          scoringPreset: 'CLASSIC_TIMED',
          matchTimerEnabled: true,
          matchTimedCapMinutes: 15,
        }),
      ),
    ).toBe(true);
  });
});
