import { describe, expect, it } from 'vitest';
import { DEFAULT_AVAILABILITY_BUCKET_BOUNDARIES } from './bucketBoundaries';
import { buildBucketMasks } from './bucketBoundaries';
import { isFullWeek } from './bitmask';
import { togglePreset } from './presets';
import {
  effectiveSlotMask,
  migrateToRolling,
  resetRollingDocToDefault,
  setRollingSlot,
  isRollingDocDefault,
} from './rolling';

const boundaries = DEFAULT_AVAILABILITY_BUCKET_BOUNDARIES;
const eveningMask = buildBucketMasks(boundaries).evening;

function eveningBaselineDoc() {
  const eveningWeek = {
    mon: eveningMask,
    tue: eveningMask,
    wed: eveningMask,
    thu: eveningMask,
    fri: eveningMask,
    sat: eveningMask,
    sun: eveningMask,
    v: 1 as const,
  };
  return migrateToRolling(eveningWeek, 'monday', '2026-06-09');
}

describe('resetRollingDocToDefault', () => {
  it('clears restricted baseline so slot resolves to 24/7', () => {
    const doc = eveningBaselineDoc();
    expect(isRollingDocDefault(doc)).toBe(false);

    const reset = resetRollingDocToDefault(doc);
    expect(isRollingDocDefault(reset)).toBe(true);
    expect(isFullWeek(effectiveSlotMask(reset, 0))).toBe(true);
  });

  it('setRollingSlot(null) alone keeps restricted baseline (regression guard)', () => {
    const doc = eveningBaselineDoc();
    const onlySlot = setRollingSlot(doc, 0, null);
    expect(isFullWeek(effectiveSlotMask(onlySlot, 0))).toBe(false);
  });

  it('weekdays + weekends from evening baseline yields full week before commit', () => {
    let wa = togglePreset(eveningBaselineDoc().baseline!, 'weekdays', boundaries);
    wa = togglePreset(wa, 'weekends', boundaries);
    expect(isFullWeek(wa)).toBe(true);
  });
});
