import type { GameTextTranslationJobErrorCategory } from '@prisma/client';

export class GameTextTranslationError extends Error {
  readonly category: GameTextTranslationJobErrorCategory;

  constructor(message: string, category: GameTextTranslationJobErrorCategory) {
    super(message);
    this.name = 'GameTextTranslationError';
    this.category = category;
  }
}

export function categorizeUnknownError(err: unknown): GameTextTranslationJobErrorCategory {
  if (err instanceof GameTextTranslationError) {
    return err.category;
  }
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (
    lower.includes('not configured') ||
    lower.includes('temporarily unavailable') ||
    lower.includes('api key')
  ) {
    return 'configuration';
  }
  if (
    lower.includes('timeout') ||
    lower.includes('rate limit') ||
    lower.includes('429') ||
    lower.includes('503') ||
    lower.includes('econnreset') ||
    lower.includes('fetch failed') ||
    lower.includes('empty ai response')
  ) {
    return 'provider';
  }
  if (
    lower.includes('invalid') ||
    lower.includes('validation') ||
    lower.includes('parse') ||
    lower.includes('structure')
  ) {
    return 'validation';
  }
  return 'unknown';
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 2000);
  return String(err).slice(0, 2000);
}
