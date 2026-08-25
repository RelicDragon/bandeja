import { describe, expect, it } from 'vitest';
import {
  getPreferenceChipClassName,
  PREFERENCE_CHIP_SELECTED_CLASS,
  PREFERENCE_CHIP_UNSET_CLASS,
} from './preferenceChipClass';

describe('getPreferenceChipClassName', () => {
  it('uses filled selected styles, not the unset outline', () => {
    const className = getPreferenceChipClassName(true);
    expect(className).toContain(PREFERENCE_CHIP_SELECTED_CLASS);
    expect(className).not.toContain('border-dashed');
    expect(className).not.toContain(PREFERENCE_CHIP_UNSET_CLASS);
  });

  it('uses dashed outline for unset, not the selected fill', () => {
    const className = getPreferenceChipClassName(false);
    expect(className).toContain(PREFERENCE_CHIP_UNSET_CLASS);
    expect(className).toContain('border-dashed');
    expect(className).not.toContain('bg-blue-600');
    expect(className).not.toContain(PREFERENCE_CHIP_SELECTED_CLASS);
  });
});
