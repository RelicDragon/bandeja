import { describe, expect, it } from 'vitest';
import { getTrainerChipClassName } from './trainerChipLayout';

describe('getTrainerChipClassName', () => {
  it('uses selected styles even when trainer has no trainings', () => {
    const className = getTrainerChipClassName({ isSelected: true, hasTrainings: false });
    expect(className).toContain('border-primary-500');
    expect(className).not.toContain('opacity-60');
  });

  it('uses muted styles for unselected trainers without trainings', () => {
    const className = getTrainerChipClassName({ isSelected: false, hasTrainings: false });
    expect(className).toContain('opacity-60');
    expect(className).not.toContain('border-primary-500');
  });

  it('uses default styles for unselected trainers with trainings', () => {
    const className = getTrainerChipClassName({ isSelected: false, hasTrainings: true });
    expect(className).toContain('bg-white');
    expect(className).not.toContain('opacity-60');
  });
});
