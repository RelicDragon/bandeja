import { projectUserForSportContext } from '../user/userSportProfile.service';

export function mapInvitedParticipantToInboxInvite(participant: {
  id: string;
  userId: string;
  gameId: string;
  inviteMessage: string | null;
  inviteExpiresAt: Date | null;
  joinedAt: Date;
  user?: unknown;
  invitedByUser: unknown;
  game: { sport?: string | null; participants?: unknown[] } & Record<string, unknown>;
}) {
  const sport = participant.game.sport;
  return {
    id: participant.id,
    receiverId: participant.userId,
    gameId: participant.gameId,
    status: 'PENDING' as const,
    message: participant.inviteMessage,
    expiresAt: participant.inviteExpiresAt,
    createdAt: participant.joinedAt,
    updatedAt: participant.joinedAt,
    receiver: participant.user
      ? projectUserForSportContext(participant.user as never, sport as never)
      : null,
    sender: {
      ...projectUserForSportContext(participant.invitedByUser as never, sport as never),
      sportProfiles: (participant.invitedByUser as { sportProfiles?: unknown } | null)?.sportProfiles,
    },
    game: {
      ...participant.game,
      participants: (participant.game.participants ?? []).map((row) => {
        const participantRow = row as {
          user?: unknown;
          invitedByUser?: unknown;
        };
        return {
          ...participantRow,
          user: projectUserForSportContext(participantRow.user as never, sport as never),
          invitedByUser: projectUserForSportContext(
            participantRow.invitedByUser as never,
            sport as never,
          ),
        };
      }),
    },
  };
}

export type InboxInviteDto = ReturnType<typeof mapInvitedParticipantToInboxInvite>;

