import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameLocalizedText } from '@/hooks/useGameLocalizedText';
import { useGameTextShowOriginal } from '@/hooks/useGameTextShowOriginal';
import { useSelectionDeferredValue } from '@/hooks/useSelectionDeferredValue';
import { isGameTextTranslationPending } from '@/utils/gameText/gameTextPending';
import type { GameTextDisplaySource } from '@/utils/gameText/gameLocalizedText.types';

export type GameDetailsLocalizedDisplay = {
  name: string | null;
  description: string | null;
  /** BCP 47 lang for translated display; null when showing authored original. */
  lang: string | null;
  showOriginal: boolean;
  hasToggle: boolean;
  showPendingHint: boolean;
  toggleShowOriginal: () => void;
  a11yAnnouncement: string;
};

/**
 * Details-surface localized name/description with session Show original memory,
 * selection-safe updates, and a polite translation-ready announcement.
 */
export function useGameDetailsLocalizedDisplay(
  game: (GameTextDisplaySource & { id?: string | null }) | null | undefined,
): GameDetailsLocalizedDisplay {
  const { t } = useTranslation();
  const gameId = game?.id ?? null;
  const { showOriginal, toggleShowOriginal } = useGameTextShowOriginal(gameId);

  const displayed = useGameLocalizedText(game, { showOriginal });
  const available = useGameLocalizedText(game, { showOriginal: false });

  const name = useSelectionDeferredValue(displayed.name);
  const description = useSelectionDeferredValue(displayed.description);

  const hasToggle = available.isTranslated;
  const showPendingHint =
    isGameTextTranslationPending(game?.localizedText) && !available.isTranslated;

  const [a11yAnnouncement, setA11yAnnouncement] = useState('');
  const prevTranslatedRef = useRef(available.isTranslated);

  useEffect(() => {
    const wasTranslated = prevTranslatedRef.current;
    prevTranslatedRef.current = available.isTranslated;
    if (!wasTranslated && available.isTranslated && !showOriginal) {
      setA11yAnnouncement(
        t('gameDetails.gameText.a11yTranslationReady', {
          defaultValue: 'Translation updated',
        }),
      );
    }
  }, [available.isTranslated, showOriginal, t]);

  return {
    name,
    description,
    lang: showOriginal || !available.isTranslated ? null : displayed.locale,
    showOriginal,
    hasToggle,
    showPendingHint,
    toggleShowOriginal,
    a11yAnnouncement,
  };
}
