import { describe, expect, it } from 'vitest';
import { DEFAULT_AVAILABILITY_BUCKET_BOUNDARIES } from './bucketBoundaries';
import { emptyWeek, fullWeek, isEmptyWeek } from './bitmask';
import {
  getPresetToggleState,
  togglePreset,
  presetFullyApplied,
} from './presets';

const boundaries = DEFAULT_AVAILABILITY_BUCKET_BOUNDARIES;

describe('togglePreset', () => {
  it('from full week, mornings replaces with mornings only', () => {
    const next = togglePreset(fullWeek(), 'mornings', boundaries);
    expect(getPresetToggleState(next, 'mornings', boundaries)).toBe('on');
    expect(getPresetToggleState(next, 'evenings', boundaries)).toBe('off');
    expect(isEmptyWeek(next)).toBe(false);
  });

  it('adds evenings on top of mornings', () => {
    let wa = togglePreset(fullWeek(), 'mornings', boundaries);
    wa = togglePreset(wa, 'evenings', boundaries);
    expect(getPresetToggleState(wa, 'mornings', boundaries)).toBe('on');
    expect(getPresetToggleState(wa, 'evenings', boundaries)).toBe('on');
  });

  it('removes mornings when fully applied', () => {
    let wa = togglePreset(emptyWeek(), 'mornings', boundaries);
    expect(presetFullyApplied(wa, 'mornings', boundaries)).toBe(true);
    wa = togglePreset(wa, 'mornings', boundaries);
    expect(getPresetToggleState(wa, 'mornings', boundaries)).toBe('off');
  });

  it('clear then mornings then evenings', () => {
    let wa = togglePreset(fullWeek(), 'clear', boundaries);
    expect(isEmptyWeek(wa)).toBe(true);
    wa = togglePreset(wa, 'mornings', boundaries);
    wa = togglePreset(wa, 'evenings', boundaries);
    expect(getPresetToggleState(wa, 'mornings', boundaries)).toBe('on');
    expect(getPresetToggleState(wa, 'evenings', boundaries)).toBe('on');
  });

  it('weekdays add does not clear weekends', () => {
    let wa = togglePreset(emptyWeek(), 'weekends', boundaries);
    wa = togglePreset(wa, 'weekdays', boundaries);
    expect(getPresetToggleState(wa, 'weekdays', boundaries)).toBe('on');
    expect(getPresetToggleState(wa, 'weekends', boundaries)).toBe('on');
  });
});
