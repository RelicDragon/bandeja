import { describe, expect, it } from 'vitest';
import { resolvePreferenceChipSelection } from './preferencePair';

describe('resolvePreferenceChipSelection', () => {
  it('selects only left when only left is set', () => {
    expect(resolvePreferenceChipSelection({ left: true, right: false })).toEqual({
      leftSelected: true,
      rightSelected: false,
    });
  });

  it('selects only right when only right is set', () => {
    expect(resolvePreferenceChipSelection({ left: false, right: true })).toEqual({
      leftSelected: false,
      rightSelected: true,
    });
  });

  it('treats omitted flags as unset, not selected', () => {
    expect(resolvePreferenceChipSelection({ left: undefined, right: undefined })).toEqual({
      leftSelected: false,
      rightSelected: false,
    });
  });

  it('keeps both selected when both flags are true', () => {
    expect(resolvePreferenceChipSelection({ left: true, right: true })).toEqual({
      leftSelected: true,
      rightSelected: true,
    });
  });
});
