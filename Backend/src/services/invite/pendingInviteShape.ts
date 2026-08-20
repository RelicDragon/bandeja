import { Sport } from '@prisma/client';
import { USER_SELECT_WITH_SPORT_PROFILES } from '../../utils/constants';
import { projectUserForSportContext } from '../user/userSportProfile.service';

export const inboxInviteGameSelect = {
  id: true,
  name: true,
  gameType: true,
  startTime: true,
  endTime: true,
  maxParticipants: true,
  minParticipants: true,
  minLevel: true,
  maxLevel: true,
  isPublic: true,
  affectsRating: true,
  hasBookedCourt: true,
  afterGameGoToBar: true,
  hasFixedTeams: true,
  teamsReady: true,
  participantsReady: true,
  status: true,
  resultsStatus: true,
  entityType: true,
  genderTeams: true,
  sport: true,
  court: { select: { id: true, name: true, club: { select: { id: true, name: true, avatar: true } } } },
  club: { select: { id: true, name: true, avatar: true } },
  participants: {
    include: {
      user: { select: USER_SELECT_WITH_SPORT_PROFILES },
      invitedByUser: { select: USER_SELECT_WITH_SPORT_PROFILES },
    },
  },
} as const;

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
  const sport = (participant.game.sport ?? Sport.PADEL) as Sport;
  const invitedBy = participant.invitedByUser as { sportProfiles?: undefined } | null;
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
      ? projectUserForSportContext(participant.user as { sportProfiles?: undefined }, sport)
      : null,
    sender: invitedBy
      ? {
          ...projectUserForSportContext(invitedBy, sport),
          sportProfiles: (participant.invitedByUser as { sportProfiles?: unknown } | null)?.sportProfiles,
        }
      : null,
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

