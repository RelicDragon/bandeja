import { deriveInviteChallenge } from '@bandeja/shared/userTeamChallenge';
import prisma from '../../config/database';

export type InviteChallengeTeams = {
  challengerTeamName: string;
  challengedTeamName: string;
};

type InviteLike = {
  receiverId?: string | null;
  sender?: { id?: string | null } | null;
  game?: {
    entityType?: string | null;
    maxParticipants?: number | null;
    participants?: Array<{ userId: string; inviteUserTeamId?: string | null }> | null;
  } | null;
};

/**
 * Team names for an invite that is a pair challenge, else `null`. Push and
 * Telegram use it to swap "invited you to a game" for challenge wording; the
 * derivation itself is shared with the app (`@bandeja/shared/userTeamChallenge`).
 */
export async function loadInviteChallengeTeams(invite: InviteLike): Promise<InviteChallengeTeams | null> {
  const game = invite.game;
  if (!game || !invite.receiverId || !game.entityType || game.maxParticipants == null) return null;
  const challenge = deriveInviteChallenge({
    receiverId: invite.receiverId,
    senderId: invite.sender?.id,
    game: {
      entityType: game.entityType,
      maxParticipants: game.maxParticipants,
      participants: game.participants ?? [],
    },
  });
  if (!challenge) return null;
  const teams = await prisma.userTeam.findMany({
    where: { id: { in: [challenge.challengerTeamId, challenge.challengedTeamId] } },
    select: { id: true, name: true },
  });
  const challenger = teams.find((t) => t.id === challenge.challengerTeamId);
  const challenged = teams.find((t) => t.id === challenge.challengedTeamId);
  if (!challenger || !challenged) return null;
  return { challengerTeamName: challenger.name, challengedTeamName: challenged.name };
}
