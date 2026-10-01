import type { Game } from '@/types';
import { isUserGameAdminOrOwner } from '@/utils/gameResults';

type TrainingRatingViewer = { id: string; isTrainer?: boolean; isAdmin?: boolean } | null | undefined;

/**
 * Mirrors the server rule for training level edits / undo (`training.service.ts`):
 * a platform admin, or a `User.isTrainer` who is this game's trainer or an
 * OWNER/ADMIN of the game or its parent. Owning a training without the trainer
 * flag (a trainee "Play with this group again") grants nothing.
 */
export function canManageTrainingRatings(game: Game, viewer: TrainingRatingViewer): boolean {
  if (!viewer?.id) return false;
  if (viewer.isAdmin) return true;
  if (!viewer.isTrainer) return false;
  if (game.trainerId === viewer.id) return true;
  return isUserGameAdminOrOwner(game, viewer.id);
}
