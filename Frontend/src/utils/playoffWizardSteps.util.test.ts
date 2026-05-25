import { describe, expect, it } from 'vitest';
import {
  getPlayoffWizardStepIndex,
  getPlayoffWizardStepTotal,
} from './playoffWizardSteps.util';

describe('playoffWizardSteps.util (UX-B3)', () => {
  it('bracket flow has 4 steps in order', () => {
    expect(getPlayoffWizardStepTotal(true)).toBe(4);
    expect(getPlayoffWizardStepIndex('config', true)).toBe(1);
    expect(getPlayoffWizardStepIndex('preview', true)).toBe(2);
    expect(getPlayoffWizardStepIndex('gameSetup', true)).toBe(3);
    expect(getPlayoffWizardStepIndex('summary', true)).toBe(4);
  });

  it('session flow has 3 steps', () => {
    expect(getPlayoffWizardStepTotal(false)).toBe(3);
    expect(getPlayoffWizardStepIndex('config', false)).toBe(1);
    expect(getPlayoffWizardStepIndex('summary', false)).toBe(2);
    expect(getPlayoffWizardStepIndex('gameSetup', false)).toBe(3);
  });
});
