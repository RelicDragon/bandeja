import {
  EntityType,
  GameStatus,
  ParticipantRole,
  ParticipantStatus,
  Sport,
  UserTeamMemberStatus,
} from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { hasParentGamePermission, hasRealParticipantStatus } from '../../utils/parentGamePermissions';
import { viewerCanInviteFromFacts, viewerCanInviteFromLoadedGame } from '../game/canInviteToGame';
import { appendGameLog } from '../game/gameLog.service';
import { ParticipantService } from '../game/participant.service';
import { applyUserTeamToFixedTeamsIfReady } from '../game/userTeamFixedTeams.service';
import { ParticipantMessageHelper } from '../game/participantMessageHelper';
import notificationService from '../notification.service';
import { validateGameCanAcceptParticipants, validateGenderForGame } from '../../utils/participantValidation';
import { isInviteInboxVisible, type InboxInviteLike } from '../../utils/gameInviteInbox';
import {
  acceptedMemberUserIds,
  classifyMembersForAddToGame,
  includeFullGameForPartner,
  isUserTeamReady,
  partnerOnGameStatus,
} from './userTeamReady';

const INVITABLE_ENTITY_TYPES: EntityType[] = [
  EntityType.GAME,
  EntityType.TOURNAMENT,
  EntityType.TRAINING,
  EntityType.LEAGUE,
];

export type UserTeamInvitableGame = {
  id: string;
  name: string | null;
  sport: Sport;
  entityType: EntityType;
  startTime: Date;
  endTime: Date;
  timeIsSet: boolean;
  avatar: string | null;
  hasFixedTeams: boolean;
  maxParticipants: number;
  playingCount: number;
  club: { id: string; name: string; avatar: string | null } | null;
  city: { id: string; name: string; timezone: string } | null;
  partnerOnGame: ReturnType<typeof partnerOnGameStatus>;
};

async function emitCreatedGameInvite(
  gameId: string,
  receiverId: string,
  invite: InboxInviteLike & {
    id: string;
    sender?: { id: string } | null;
    receiver?: { id: string } | null;
  },
): Promise<void> {
  if (invite.sender && invite.receiver) {
    await appendGameLog({
      gameId,
      type: 'USER_INVITED',
      actorId: invite.sender.id,
      targetId: invite.receiver.id,
      metadata: { inviteId: invite.id, asTrainer: false },
    });
  }
  if (isInviteInboxVisible(invite)) {
    const sockets = (global as { socketService?: { emitNewInvite: (id: string, payload: unknown) => void } }).socketService;
    sockets?.emitNewInvite(receiverId, invite);
  }
  if (invite.game) {
    notificationService.sendInviteNotification(invite).catch((error: unknown) => {
      console.error('Failed to send user-team add-to-game invite notification:', error);
    });
  }
}

async function loadReadyTeamForMember(teamId: string, userId: string) {
  const team = await prisma.userTeam.findUnique({
    where: { id: teamId },
    include: { members: true },
  });
  if (!team) throw new ApiError(404, 'errors.userTeams.notFound');
  const membership = team.members.find((m) => m.userId === userId);
  if (!membership) throw new ApiError(403, 'errors.userTeams.accessDenied');
  if (membership.status !== UserTeamMemberStatus.ACCEPTED) {
    throw new ApiError(403, 'errors.userTeams.notAcceptedMember');
  }
  return team;
}

export async function listInvitableGamesForUserTeam(
  teamId: string,
  viewerId: string,
  isAdmin: boolean,
): Promise<UserTeamInvitableGame[]> {
  const team = await loadReadyTeamForMember(teamId, viewerId);
  if (!isUserTeamReady(team)) {
    throw new ApiError(400, 'errors.userTeams.notReady');
  }
  const memberIds = acceptedMemberUserIds(team);
  const partnerId = memberIds.find((id) => id !== viewerId);
  const now = new Date();

  const rows = await prisma.gameParticipant.findMany({
    where: {
      userId: viewerId,
      status: { in: [ParticipantStatus.PLAYING, ParticipantStatus.NON_PLAYING] },
      game: {
        status: GameStatus.ANNOUNCED,
        entityType: { in: INVITABLE_ENTITY_TYPES },
        OR: [{ timeIsSet: false }, { endTime: { gte: now } }],
      },
    },
    select: {
      game: {
        select: {
          id: true,
          name: true,
          sport: true,
          entityType: true,
          startTime: true,
          endTime: true,
          timeIsSet: true,
          avatar: true,
          hasFixedTeams: true,
          maxParticipants: true,
          anyoneCanInvite: true,
          club: { select: { id: true, name: true, avatar: true } },
          city: { select: { id: true, name: true, timezone: true } },
          participants: { select: { userId: true, status: true, role: true } },
          parent: {
            select: {
              participants: {
                where: { userId: viewerId },
                select: { status: true, role: true },
              },
            },
          },
        },
      },
    },
    orderBy: { game: { startTime: 'asc' } },
    take: 200,
  });

  const unique: typeof rows = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.game.id)) continue;
    seen.add(row.game.id);
    unique.push(row);
  }

  const invitable: UserTeamInvitableGame[] = [];
  for (const row of unique) {
    if (
      !viewerCanInviteFromLoadedGame({
        viewerId,
        isAdmin,
        anyoneCanInvite: row.game.anyoneCanInvite,
        participants: row.game.participants,
        parentParticipants: row.game.parent?.participants,
      })
    ) {
      continue;
    }
    const game = row.game;
    const playingCount = game.participants.filter((p) => p.status === ParticipantStatus.PLAYING).length;
    const partnerOnGame = partnerOnGameStatus(partnerId, game.participants);
    const full = game.entityType !== EntityType.BAR && playingCount >= game.maxParticipants;
    if (full && !includeFullGameForPartner(partnerOnGame)) continue;
    invitable.push({
      id: game.id,
      name: game.name,
      sport: game.sport,
      entityType: game.entityType,
      startTime: game.startTime,
      endTime: game.endTime,
      timeIsSet: game.timeIsSet,
      avatar: game.avatar,
      hasFixedTeams: game.hasFixedTeams,
      maxParticipants: game.maxParticipants,
      playingCount,
      club: game.club,
      city: game.city,
      partnerOnGame,
    });
    if (invitable.length >= 50) break;
  }
  return invitable;
}

export async function addUserTeamToGame(
  teamId: string,
  viewerId: string,
  isAdmin: boolean,
  gameId: string,
): Promise<{
  gameId: string;
  invitedUserIds: string[];
  taggedUserIds: string[];
  pairSeated: boolean;
}> {
  const team = await loadReadyTeamForMember(teamId, viewerId);
  if (!isUserTeamReady(team)) {
    throw new ApiError(400, 'errors.userTeams.notReady');
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      anyoneCanInvite: true,
      status: true,
      entityType: true,
      genderTeams: true,
      maxParticipants: true,
      participants: {
        select: {
          userId: true,
          status: true,
          user: { select: { gender: true } },
        },
      },
    },
  });
  if (!game) throw new ApiError(404, 'errors.invites.gameNotFound');
  validateGameCanAcceptParticipants(game);
  if (game.status === GameStatus.STARTED) {
    throw new ApiError(400, 'errors.invites.cannotSendAfterGameStarted');
  }

  const [hasRealStatus, isOwnerOrAdmin] = await Promise.all([
    hasRealParticipantStatus(gameId, viewerId),
    hasParentGamePermission(
      gameId,
      viewerId,
      [ParticipantRole.OWNER, ParticipantRole.ADMIN],
      isAdmin,
    ),
  ]);
  const isParticipant = await hasParentGamePermission(
    gameId,
    viewerId,
    [ParticipantRole.OWNER, ParticipantRole.ADMIN, ParticipantRole.PARTICIPANT],
    isAdmin,
  );
  if (
    !viewerCanInviteFromFacts({
      hasRealParticipantStatus: hasRealStatus,
      isOwnerOrAdmin,
      anyoneCanInvite: game.anyoneCanInvite,
      isParticipant,
    })
  ) {
    throw new ApiError(403, 'errors.invites.onlyParticipantsCanSend');
  }

  const acceptedIds = acceptedMemberUserIds(team);
  const existing = game.participants.map((p) => ({ userId: p.userId, status: p.status }));
  const classified = classifyMembersForAddToGame(acceptedIds, existing);
  const toTag = [...classified.toTag];
  const toInvite = classified.toInvite.filter((id) => id !== viewerId);

  for (const receiverId of toInvite) {
    await validateGenderForGame(game, receiverId, { targetIsOtherUser: true });
  }

  for (const queueUserId of classified.toPromoteFromQueue) {
    await ParticipantService.acceptNonPlayingParticipant(gameId, viewerId, queueUserId);
    toTag.push(queueUserId);
  }

  const invitedUserIds: string[] = [];
  for (const receiverId of toInvite) {
    const { invite } = await ParticipantService.sendInvite(
      gameId,
      viewerId,
      receiverId,
      null,
      null,
      false,
      teamId,
      null,
    );
    await emitCreatedGameInvite(gameId, receiverId, invite);
    invitedUserIds.push(receiverId);
  }

  if (toTag.length > 0) {
    await prisma.gameParticipant.updateMany({
      where: { gameId, userId: { in: toTag } },
      data: { inviteUserTeamId: teamId },
    });
  }

  await applyUserTeamToFixedTeamsIfReady(gameId, teamId);
  await ParticipantMessageHelper.emitGameUpdate(gameId, viewerId);

  const playing = await prisma.gameParticipant.findMany({
    where: { gameId, status: ParticipantStatus.PLAYING, userId: { in: acceptedIds } },
    select: { userId: true },
  });
  const playingSet = new Set(playing.map((p) => p.userId));
  let pairSeated = acceptedIds.every((id) => playingSet.has(id));
  if (pairSeated) {
    const teams = await prisma.gameTeam.findMany({
      where: { gameId },
      include: { players: { select: { userId: true } } },
    });
    const sorted = [...acceptedIds].sort();
    pairSeated = teams.some((t) => {
      const pids = t.players.map((p) => p.userId).sort();
      return pids.length === sorted.length && pids.every((id, i) => id === sorted[i]);
    });
  }

  return {
    gameId,
    invitedUserIds,
    taggedUserIds: toTag,
    pairSeated,
  };
}
