import { describe, expect, it } from 'vitest';
import { getGroupSetupStatus } from './playoffWizardGroupSetup.util';

describe('playoffWizardGroupSetup.util (UX-B8)', () => {
  it('marks group ready when count is within bracket bounds', () => {
    expect(
      getGroupSetupStatus({ selectedCount: 8, minParticipants: 2, maxParticipants: 16 })
    ).toBe('ready');
  });

  it('marks group incomplete below min or above max', () => {
    expect(getGroupSetupStatus({ selectedCount: 1, minParticipants: 2 })).toBe('incomplete');
    expect(
      getGroupSetupStatus({ selectedCount: 17, minParticipants: 2, maxParticipants: 16 })
    ).toBe('incomplete');
  });
});
