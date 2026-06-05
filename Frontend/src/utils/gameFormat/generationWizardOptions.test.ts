import { describe, expect, it } from 'vitest';
import {
  listWizardSelectableGenerations,
  shouldShowGameFormatGenerationStep,
} from './generationWizardOptions';

describe('generationWizardOptions', () => {
  it('hides generation step when only automatic is selectable', () => {
    const options = listWizardSelectableGenerations({
      entityType: 'GAME',
      maxParticipants: 4,
    });
    expect(options).toEqual(['AUTOMATIC']);
    expect(shouldShowGameFormatGenerationStep(options)).toBe(false);
  });

  it('shows generation step when rotation formats are available', () => {
    const options = listWizardSelectableGenerations({
      entityType: 'GAME',
      maxParticipants: 8,
    });
    expect(options).toContain('RANDOM');
    expect(shouldShowGameFormatGenerationStep(options)).toBe(true);
  });

  it('never offers handmade or fixed in the wizard', () => {
    const options = listWizardSelectableGenerations({
      entityType: 'TOURNAMENT',
      maxParticipants: 12,
    });
    expect(options).not.toContain('HANDMADE');
    expect(options).not.toContain('FIXED');
  });
});
