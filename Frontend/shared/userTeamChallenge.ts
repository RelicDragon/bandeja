/**
 * Pair challenge: one user team challenges another to a 2v2 match.
 *
 * A challenge is **not** a separate record. It is an ordinary game where the
 * challenger pair is seated through the add-pair-to-game path and the
 * challenged pair is invited through the normal invite path with
 * `GameParticipant.inviteUserTeamId`. Both API and app derive "this invite is a
 * challenge" from the participant rows alone, so old clients and old invites
 * need nothing new.
 */

export const USER_TEAM_CHALLENGE_PLAYERS = 4;

export type ChallengeGameShape = {
  entityType: string;
  maxParticipants: number;
};

/** A challenge is a plain 2v2 GAME — no tournaments, trainings, leagues or bars. */
export function isChallengeableGame(game: ChallengeGameShape): boolean {
  return game.entityType === 'GAME' && game.maxParticipants === USER_TEAM_CHALLENGE_PLAYERS;
}

/**
 * Room for the challenged pair in an existing game the challenger is already in.
 * `playingCount` counts PLAYING seats only; the challenger pair needs both seats
 * (one is the viewer's), the challenged pair needs two more.
 */
export function challengeSeatsFit(playingCount: number, partnerPlaying: boolean): boolean {
  const challengerSeatsTaken = partnerPlaying ? 2 : 1;
  const othersPlaying = Math.max(0, playingCount - challengerSeatsTaken);
  return othersPlaying === 0;
}

export type ChallengeParticipantShape = {
  userId: string;
  inviteUserTeamId?: string | null;
};

export type InviteChallenge = {
  challengerTeamId: string;
  challengedTeamId: string;
};

/**
 * The invite is a challenge when, in a challengeable game, the receiver was
 * invited as a member of one user team while the sender sits in the game as a
 * member of a *different* user team. A teammate adding their own pair stamps the
 * same team on both rows, so that is never a challenge.
 */
export function deriveInviteChallenge(input: {
  receiverId: string;
  senderId: string | null | undefined;
  game: ChallengeGameShape & { participants?: ChallengeParticipantShape[] | null };
}): InviteChallenge | null {
  const { receiverId, senderId, game } = input;
  if (!senderId || senderId === receiverId) return null;
  if (!isChallengeableGame(game)) return null;
  const rows = game.participants ?? [];
  const challengedTeamId = rows.find((p) => p.userId === receiverId)?.inviteUserTeamId ?? null;
  const challengerTeamId = rows.find((p) => p.userId === senderId)?.inviteUserTeamId ?? null;
  if (!challengedTeamId || !challengerTeamId) return null;
  if (challengedTeamId === challengerTeamId) return null;
  return { challengerTeamId, challengedTeamId };
}
