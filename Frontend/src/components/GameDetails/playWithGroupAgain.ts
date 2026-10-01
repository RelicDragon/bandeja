import type { BasicUser, EntityType, Game } from '@/types';
import { getEntityCapabilities } from '@shared/entityCapabilities';
import { getGameParticipationState } from '@/utils/gameParticipationState';
import {
  buildRematchGameInitialData,
  previousRosterInvitees,
} from '@/utils/buildDuplicateGameInitialData';

/**
 * PRD 362 — the rules behind **Play with this group again**, kept out of the
 * `.tsx` so they can be unit-tested and so the shell (TRAINING / BAR blocks)
 * and the results share card (GAME / TOURNAMENT) share one definition.
 */

/** What the create flow needs to know it is a rematch draft (banner copy only). */
export interface RematchSource {
  gameId: string;
  /** Old game's authored name, or the sport label when it had none. */
  title: string;
}

/** `location.state` for `/create-game` when opened from a finished game. */
export interface RematchNavigationState {
  entityType: EntityType;
  initialGameData: Partial<Game>;
  invitedPlayerIds: string[];
  invitedPlayers: BasicUser[];
  invitedTrainerId: string | null;
  /** TRAINING rematch started by the previous trainer: they run it again, they do not play. */
  creatorNonPlaying: boolean;
  rematchOf: RematchSource;
}

/**
 * Who sees the button: results are FINAL, the entity type can be rematched,
 * and the viewer either played (PLAYING) or was the trainer of a TRAINING. A
 * trainer is NON_PLAYING by construction, so the plain "was playing" rule would
 * hide the one action a coach wants after a session.
 */
export function canPlayWithGroupAgain(game: Game, viewerId: string | undefined): boolean {
  if (!viewerId) return false;
  if (game.resultsStatus !== 'FINAL') return false;
  if (!getEntityCapabilities(game.entityType).canRematch) return false;
  if (game.entityType === 'TRAINING' && game.trainerId === viewerId) return true;
  return getGameParticipationState(game.participants ?? [], viewerId, game).isPlaying;
}

export function buildRematchNavigationState(
  game: Game,
  viewerId: string,
  title: string,
): RematchNavigationState {
  const invitees = previousRosterInvitees(game, viewerId);
  return {
    entityType: game.entityType,
    initialGameData: buildRematchGameInitialData(game),
    invitedPlayerIds: invitees.playerIds,
    invitedPlayers: invitees.players,
    invitedTrainerId: invitees.trainerId,
    creatorNonPlaying: game.entityType === 'TRAINING' && game.trainerId === viewerId,
    rematchOf: { gameId: game.id, title },
  };
}
