import { normalizeAppUiLanguage } from '@bandeja/app-locale';
import type { GameTextDisplaySource } from './gameLocalizedText.types';
import { resolveDisplayedGameText } from './resolveDisplayedGameText';

export type AuthoredGameTextForEdit = {
  name: string;
  description: string;
};

/**
 * Edit/create seed values: authored `name` / `description` only.
 * Never reads `localizedText` or the display resolver.
 */
export function authoredGameTextForEdit(
  game: GameTextDisplaySource | null | undefined,
): AuthoredGameTextForEdit {
  // Deliberately ignore game.localizedText — edit seeds must stay on authored columns.
  return {
    name: game?.name ?? '',
    description: game?.description ?? '',
  };
}

/**
 * Show “Original text” when the surrounding game details would display a translation
 * for the current app UI locale (not when create has no projection yet).
 */
export function shouldLabelAuthoredEditAsOriginal(
  game: GameTextDisplaySource | null | undefined,
  locale?: string | null,
): boolean {
  return resolveDisplayedGameText(game, {
    locale: normalizeAppUiLanguage(locale),
  }).isTranslated;
}
