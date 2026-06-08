import {
  customByeErrorI18nKey,
  customPlayInErrorI18nKey,
  getCustomByeValidation,
  getCustomPlayInValidation,
} from '@/utils/playoffWizardValidation.util';
import type { BracketTranslate, BracketWizardValidationError } from './types';
import type { PlayInSeedPair } from '@/utils/bracketCustomPlayIn.util';

export type BracketWizardGroupValidationInput = {
  entrantCount: number;
  customByeEnabled: boolean;
  customByeSeedRanks: number[];
  customPlayInEnabled: boolean;
  playInSeedPairs: PlayInSeedPair[];
};

export function validateBracketWizardGroupOptions(
  input: BracketWizardGroupValidationInput
): { valid: true } | { valid: false; errors: BracketWizardValidationError[] } {
  const errors: BracketWizardValidationError[] = [];
  const byeCheck = getCustomByeValidation(
    input.entrantCount,
    input.customByeEnabled,
    input.customByeSeedRanks
  );
  if (!byeCheck.valid) errors.push({ kind: 'bye', code: byeCheck.error });
  const playInCheck = getCustomPlayInValidation(
    input.entrantCount,
    input.customPlayInEnabled,
    input.playInSeedPairs,
    input.customByeEnabled ? input.customByeSeedRanks : undefined
  );
  if (!playInCheck.valid) errors.push({ kind: 'playIn', code: playInCheck.error });
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

export function bracketWizardErrorMessage(
  error: BracketWizardValidationError,
  translate: BracketTranslate
): string {
  if (error.kind === 'bye') {
    return translate(customByeErrorI18nKey(error.code), { defaultValue: 'Invalid custom bye selection' });
  }
  return translate(customPlayInErrorI18nKey(error.code), { defaultValue: 'Invalid play-in pairings' });
}
