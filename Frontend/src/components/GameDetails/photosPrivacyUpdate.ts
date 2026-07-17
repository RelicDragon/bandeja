import type { Game } from '@/types';

export function mergePhotosPrivacyIntoGame(game: Game, forbidOthersPhotosView: boolean): Game {
  return { ...game, forbidOthersPhotosView };
}
