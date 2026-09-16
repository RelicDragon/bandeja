import { useCallback, useSyncExternalStore } from 'react';
import {
  getGameTextShowOriginal,
  setGameTextShowOriginal,
  subscribeGameTextShowOriginal,
  toggleGameTextShowOriginal,
} from '@/utils/gameText/gameTextShowOriginalSession';

/**
 * Session-remembered Show original preference for one game.
 * Shared across details surfaces (title + description) and remounts.
 */
export function useGameTextShowOriginal(gameId: string | null | undefined): {
  showOriginal: boolean;
  setShowOriginal: (value: boolean) => void;
  toggleShowOriginal: () => void;
} {
  const id = gameId ?? '';
  const showOriginal = useSyncExternalStore(
    subscribeGameTextShowOriginal,
    () => (id ? getGameTextShowOriginal(id) : false),
    () => false,
  );

  const setShowOriginal = useCallback(
    (value: boolean) => {
      if (!id) return;
      setGameTextShowOriginal(id, value);
    },
    [id],
  );

  const toggleShowOriginal = useCallback(() => {
    if (!id) return;
    toggleGameTextShowOriginal(id);
  }, [id]);

  return { showOriginal, setShowOriginal, toggleShowOriginal };
}
