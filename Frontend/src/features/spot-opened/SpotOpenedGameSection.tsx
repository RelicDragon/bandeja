import { useCallback } from 'react';
import { gamesApi } from '@/api';
import type { Game } from '@/types';
import { GameQueuePanel } from './GameQueuePanel';
import { SeatedFromQueueBanner } from './SeatedFromQueueBanner';
import { useSpotOpenedRealtime } from './useSpotOpenedRealtime';

export interface SpotOpenedGameSectionProps {
  game: Game;
  viewerUserId: string | undefined;
  /** Owner or admin — gets the "Ana joined from the queue" toast. */
  isOrganizer: boolean;
  /** PRD 364 — the "Next steps" block carries the open-seat fact for this viewer. */
  hideOpenSpotRow?: boolean;
  onGameUpdate: (game: Game) => void;
}

/**
 * PRD 347 — everything the game-details page owes a freed seat, in one mount:
 * the queue panel, the one-time seated header and the live socket wiring.
 *
 * The `?join=1` consumer deliberately does **not** live here. This section is
 * rendered inside the tab content, so on a surface where another tab is active
 * it is unmounted — and a deep link that lands with a non-default tab would
 * silently never join. `JoinFromDeepLink` is mounted by the shell instead, once,
 * outside the tab switch.
 */
export function SpotOpenedGameSection({
  game,
  viewerUserId,
  isOrganizer,
  hideOpenSpotRow = false,
  onGameUpdate,
}: SpotOpenedGameSectionProps) {
  const refresh = useCallback(() => {
    void (async () => {
      try {
        const response = await gamesApi.getById(game.id);
        onGameUpdate(response.data);
      } catch {
        /* transient: the next game-updated event refreshes anyway */
      }
    })();
  }, [game.id, onGameUpdate]);

  const { seatedLive } = useSpotOpenedRealtime({
    gameId: game.id,
    viewerUserId,
    isOrganizer,
    onRefresh: refresh,
    game,
  });

  return (
    <>
      <SeatedFromQueueBanner gameId={game.id} seatedLive={seatedLive} />
      <GameQueuePanel game={game} viewerUserId={viewerUserId} hideOpenSpotRow={hideOpenSpotRow} />
    </>
  );
}
