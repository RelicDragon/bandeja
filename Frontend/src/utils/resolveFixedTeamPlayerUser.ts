import type { BasicUser, Game } from '@/types';

/** Fixed-team API embeds may carry global User.level; participants use sport-projected level. */
export function resolveFixedTeamPlayerUser(
  game: Game,
  userId: string,
  fallback: BasicUser,
): BasicUser {
  const participant = game.participants.find((p) => p.userId === userId);
  return participant?.user ?? fallback;
}
