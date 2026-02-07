import prisma from '../config/database';
import { Gender, GenderTeam, EntityType, GameStatus } from '@prisma/client';
import { ApiError } from './ApiError';

interface GameWithParticipants {
  id: string;
  genderTeams: GenderTeam;
  maxParticipants: number;
  entityType: EntityType;
  participants?: Array<{
    userId: string;
    status?: string;
    isTrainer?: boolean;
    user?: {
      gender: Gender;
    };
  }>;
}

export interface GameWithStatus extends GameWithParticipants {
  status: GameStatus;
  allowDirectJoin?: boolean;
  anyoneCanInvite?: boolean;
}

export interface PlayerJoinResult {
  canJoin: boolean;
  shouldQueue: boolean;
  reason?: string;
}

export function validateGameCanAcceptParticipants(game: { status: GameStatus }): void {
  if (game.status === GameStatus.ARCHIVED || game.status === GameStatus.FINISHED) {
    throw new ApiError(400, 'errors.games.cannotJoinArchivedOrFinished');
  }
}

export async function validateGenderForGame(
  game: GameWithParticipants,
  newUserId: string
): Promise<void> {
  if (game.entityType === EntityType.BAR) {
    return;
  }

  const newUser = await prisma.user.findUnique({
    where: { id: newUserId },
    select: { gender: true },
  });

  if (!newUser) {
    throw new ApiError(404, 'User not found');
  }

  switch (game.genderTeams) {
    case GenderTeam.ANY:
      break;

    case GenderTeam.MEN:
      if (newUser.gender !== Gender.MALE) {
        throw new ApiError(400, 'Only male players can join this game');
      }
      break;

    case GenderTeam.WOMEN:
      if (newUser.gender !== Gender.FEMALE) {
        throw new ApiError(400, 'Only female players can join this game');
      }
      break;

    case GenderTeam.MIX_PAIRS:
      if (newUser.gender !== Gender.MALE && newUser.gender !== Gender.FEMALE) {
        throw new ApiError(400, 'Only male or female players can join this game');
      }
      break;
  }
}

export async function canAddPlayerToGame(
  game: GameWithParticipants,
  newUserId: string
): Promise<PlayerJoinResult> {
  if (game.entityType === EntityType.BAR) {
    return { canJoin: true, shouldQueue: false };
  }

  const newUser = await prisma.user.findUnique({
    where: { id: newUserId },
    select: { gender: true },
  });

  if (!newUser) {
    throw new ApiError(404, 'User not found');
  }

  const countsTowardSlots = (p: { status?: string; isTrainer?: boolean }) =>
    p.status === 'PLAYING' && !(game.entityType === EntityType.TRAINING && p.isTrainer);
  let existingPlayingParticipants = game.participants?.filter(p => countsTowardSlots(p)) || [];

  if (existingPlayingParticipants.length > 0 && (!existingPlayingParticipants[0].user || !existingPlayingParticipants[0].user.gender)) {
    const participantIds = existingPlayingParticipants.map(p => p.userId);
    const participantsWithGender = await prisma.gameParticipant.findMany({
      where: {
        gameId: game.id,
        userId: { in: participantIds },
        status: 'PLAYING',
      },
      include: {
        user: {
          select: {
            gender: true,
          },
        },
      },
    });
    existingPlayingParticipants = participantsWithGender;
  }

  switch (game.genderTeams) {
    case GenderTeam.ANY:
      if (existingPlayingParticipants.length >= game.maxParticipants) {
        return { canJoin: false, shouldQueue: true, reason: 'errors.invites.gameFull' };
      }
      return { canJoin: true, shouldQueue: false };

    case GenderTeam.MEN:
      const maleParticipants = existingPlayingParticipants.filter(
        p => p.user?.gender === Gender.MALE
      );

      if (maleParticipants.length >= game.maxParticipants) {
        return { canJoin: false, shouldQueue: true, reason: 'errors.invites.gameFull' };
      }
      return { canJoin: true, shouldQueue: false };

    case GenderTeam.WOMEN:
      const femaleParticipants = existingPlayingParticipants.filter(
        p => p.user?.gender === Gender.FEMALE
      );

      if (femaleParticipants.length >= game.maxParticipants) {
        return { canJoin: false, shouldQueue: true, reason: 'errors.invites.gameFull' };
      }
      return { canJoin: true, shouldQueue: false };

    case GenderTeam.MIX_PAIRS:
      const sameGenderParticipants = existingPlayingParticipants.filter(
        p => p.user?.gender === newUser.gender
      );

      const maxPerGender = Math.floor(game.maxParticipants / 2);

      if (sameGenderParticipants.length >= maxPerGender) {
        return { canJoin: false, shouldQueue: true, reason: `Maximum ${maxPerGender} ${newUser.gender.toLowerCase()} players allowed in this game` };
      }
      return { canJoin: true, shouldQueue: false };
  }
}

export async function validatePlayerCanJoinGame(
  game: GameWithStatus,
  userId: string
): Promise<PlayerJoinResult> {
  validateGameCanAcceptParticipants(game);
  await validateGenderForGame(game, userId);
  return await canAddPlayerToGame(game, userId);
}

export function canUserManageQueue(
  participant: { role: string; status?: string } | null,
  game: { anyoneCanInvite: boolean }
): boolean {
  const playing = !!(participant && participant.status === 'PLAYING');
  return !!participant && (
    participant.role === 'OWNER' ||
    participant.role === 'ADMIN' ||
    (game.anyoneCanInvite && playing)
  );
}

export async function validateAndGetGameInTransaction(
  tx: any,
  gameId: string,
  userId: string
): Promise<{ game: GameWithStatus; joinResult: PlayerJoinResult }> {
  const { fetchGameWithPlayingParticipants } = await import('./gameQueries');
  const game = await fetchGameWithPlayingParticipants(tx, gameId);
  const joinResult = await validatePlayerCanJoinGame(game, userId);

  if (!joinResult.canJoin) {
    throw new ApiError(400, joinResult.reason || 'errors.games.cannotAddPlayer');
  }

  return { game, joinResult };
}
