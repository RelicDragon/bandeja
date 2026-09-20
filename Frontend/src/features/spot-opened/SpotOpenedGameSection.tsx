import { useCallback } from 'react';
import { gamesApi } from '@/api';
import type { Game } from '@/types';
import { GameQueuePanel } from './GameQueuePanel';
import { JoinFromDeepLink } from './JoinFromDeepLink';
import { SeatedFromQueueBanner } from './SeatedFromQueueBanner';
import { useSpotOpenedRealtime } from './useSpotOpenedRealtime';

export interface SpotOpenedGameSectionProps {
  game: Game;
  viewerUserId: string | undefined;
  /** Owner or admin — gets the "Ana joined from the queue" toast. */
  isOrganizer: boolean;
  /** `shouldSwallowJoinDeepLink(...)` — when `?join=1` must not run the join. */
  alreadyInvolved: boolean;
  onGameUpdate: (game: Game) => void;
  /** The details page's own join handler (gates + overlap confirm included). */
  onJoin: () => void;
}

/**
 * PRD 347 — everything the game-details page owes a freed seat, in one mount.
 *
 * Kept as a single component so the details shell needs exactly one insertion
 * point: the queue panel, the one-time seated header, the live socket wiring
 * and the `?join=1` deep-link consumer.
 */
export function SpotOpenedGameSection({
  game,
  viewerUserId,
  isOrganizer,
  alreadyInvolved,
  onGameUpdate,
  onJoin,
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
      <GameQueuePanel game={game} viewerUserId={viewerUserId} />
      <JoinFromDeepLink ready alreadyInvolved={alreadyInvolved} onJoin={onJoin} />
    </>
  );
}
