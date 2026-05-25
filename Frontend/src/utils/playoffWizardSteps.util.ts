export type PlayoffWizardStep = 'config' | 'preview' | 'summary' | 'gameSetup';

const BRACKET_STEP_ORDER: PlayoffWizardStep[] = ['config', 'preview', 'gameSetup', 'summary'];
const SESSION_STEP_ORDER: PlayoffWizardStep[] = ['config', 'summary', 'gameSetup'];

export function getPlayoffWizardStepTotal(isBracket: boolean): number {
  return isBracket ? 4 : 3;
}

export function getPlayoffWizardStepIndex(step: PlayoffWizardStep, isBracket: boolean): number {
  const order = isBracket ? BRACKET_STEP_ORDER : SESSION_STEP_ORDER;
  const idx = order.indexOf(step);
  return idx < 0 ? 1 : idx + 1;
}
