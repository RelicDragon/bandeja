import { GrammyError } from 'grammy';

const BENIGN_RECIPIENT_403_SUBSTRINGS = ['blocked by the user', 'user is deactivated'];

export function isBenignTelegramRecipientError(error: unknown): boolean {
  if (!(error instanceof GrammyError)) return false;
  if (error.error_code !== 403) return false;
  const d = error.description.toLowerCase();
  return BENIGN_RECIPIENT_403_SUBSTRINGS.some((s) => d.includes(s));
}
