import { useTranslation } from 'react-i18next';
import { normalizeAppUiLanguage } from '@bandeja/app-locale';
import {
  resolveDisplayedGameText,
  type DisplayedGameText,
  type ResolveDisplayedGameTextOptions,
} from '@/utils/gameText/resolveDisplayedGameText';
import type { GameTextDisplaySource } from '@/utils/gameText/gameLocalizedText.types';

export type UseGameLocalizedTextOptions = Omit<ResolveDisplayedGameTextOptions, 'locale'> & {
  locale?: string | null;
};

/**
 * Shared display hook for game name/description surfaces.
 * Cards/details wiring can consume this; does not fetch — uses payload projection.
 */
export function useGameLocalizedText(
  game: GameTextDisplaySource | null | undefined,
  options?: UseGameLocalizedTextOptions,
): DisplayedGameText {
  const { i18n } = useTranslation();
  const locale = normalizeAppUiLanguage(options?.locale ?? i18n.language);
  return resolveDisplayedGameText(game, {
    showOriginal: options?.showOriginal,
    locale,
  });
}
