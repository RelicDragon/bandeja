import prisma from '../config/database';
import { Gender, GenderTeam, EntityType } from '@prisma/client';
import { ApiError } from './ApiError';

interface GameWithParticipants {
  id: string;
  genderTeams: GenderTeam;
  maxParticipants: number;
  entityType: EntityType;
  participants?: Array<{
    userId: string;
    isPlaying: boolean;
    user?: {
      gender: Gender;
    };
  }>;
}

export async function canAddPlayerToGame(
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

  let existingPlayingParticipants = game.participants?.filter(p => p.isPlaying) || [];

  if (existingPlayingParticipants.length > 0 && (!existingPlayingParticipants[0].user || !existingPlayingParticipants[0].user.gender)) {
    const participantIds = existingPlayingParticipants.map(p => p.userId);
    const participantsWithGender = await prisma.gameParticipant.findMany({
      where: {
        gameId: game.id,
        userId: { in: participantIds },
        isPlaying: true,
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
        throw new ApiError(400, 'Game is full');
      }
      break;

    case GenderTeam.MEN:
      if (newUser.gender !== Gender.MALE) {
        throw new ApiError(400, 'Only male players can join this game');
      }

      const maleParticipants = existingPlayingParticipants.filter(
        p => p.user?.gender === Gender.MALE
      );

      if (maleParticipants.length >= game.maxParticipants) {
        throw new ApiError(400, 'Game is full');
      }
      break;

    case GenderTeam.WOMEN:
      if (newUser.gender !== Gender.FEMALE) {
        throw new ApiError(400, 'Only female players can join this game');
      }

      const femaleParticipants = existingPlayingParticipants.filter(
        p => p.user?.gender === Gender.FEMALE
      );

      if (femaleParticipants.length >= game.maxParticipants) {
        throw new ApiError(400, 'Game is full');
      }
      break;

    case GenderTeam.MIX_PAIRS:
      if (newUser.gender !== Gender.MALE && newUser.gender !== Gender.FEMALE) {
        throw new ApiError(400, 'Only male or female players can join this game');
      }

      const sameGenderParticipants = existingPlayingParticipants.filter(
        p => p.user?.gender === newUser.gender
      );

      const maxPerGender = Math.floor(game.maxParticipants / 2);

      if (sameGenderParticipants.length >= maxPerGender) {
        throw new ApiError(400, `Maximum ${maxPerGender} ${newUser.gender.toLowerCase()} players allowed in this game`);
      }
      break;
  }
}

