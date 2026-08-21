import {
  EntityType,
  ParticipantRole,
  ParticipantStatus,
  type Gender,
  type Sport,
} from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import prisma from '../../config/database';
import {
  gameMatchScore,
  intentMatchesGame,
  timeStringToMinutes,
  type IntentCriteria,
} from './playIntentCriteria';
import { futureGameDateBounds } from './playIntentFreshness';
import {
  MATCHING_GAMES_VISIBLE_CAP,
  hasOpenPlayingSlot,
  mixPairsSeatIsFree,
  radarEntityTypes,
  rankMatchingGames,
} from './playIntentMatchingGames';

export type MatchingGameFace = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
};

export type MatchingLobbyGame = {
  id: string;
  entityType: EntityType;
  allowDirectJoin: boolean;
  genderTeams: string | null;
  startTime: string;
  timeLabel: string;
  club: { id: string; name: string } | null;
  maxParticipants: number;
  playingCount: number;
  playingAvatars: MatchingGameFace[];
  ownerAvatar: MatchingGameFace | null;
};

type ListedGame = {
  id: string;
  entityType: EntityType;
  allowDirectJoin: boolean;
  genderTeams: string | null;
  startTime: Date;
  minLevel: number | null;
  maxLevel: number | null;
  clubId: string | null;
  club: { id: string; name: string } | null;
  maxParticipants: number;
  participants: Array<{
    userId: string;
    role: ParticipantRole;
    status: ParticipantStatus;
    user: {
      firstName: string | null;
      lastName: string | null;
      avatar: string | null;
      gender: Gender | null;
    };
  }>;
};

function playingOf(game: ListedGame) {
  return game.participants.filter(
    (participant) => participant.status === ParticipantStatus.PLAYING,
  );
}

function ownerFace(game: ListedGame): MatchingGameFace | null {
  const owner = game.participants.find(
    (participant) => participant.role === ParticipantRole.OWNER,
  );
  if (!owner) return null;
  return {
    userId: owner.userId,
    firstName: owner.user.firstName,
    lastName: owner.user.lastName,
    avatar: owner.user.avatar,
  };
}

function playingFaces(game: ListedGame): MatchingGameFace[] {
  const playing = playingOf(game);
  const owner = playing.find(
    (participant) => participant.role === ParticipantRole.OWNER,
  );
  const rest = playing.filter(
    (participant) => participant.role !== ParticipantRole.OWNER,
  );
  const ordered = [...(owner ? [owner] : []), ...rest].slice(0, 3);
  if (ordered.length > 0) {
    return ordered.map((participant) => ({
      userId: participant.userId,
      firstName: participant.user.firstName,
      lastName: participant.user.lastName,
      avatar: participant.user.avatar,
    }));
  }
  const fallback = ownerFace(game);
  return fallback ? [fallback] : [];
}

function viewerBlocksGame(
  game: ListedGame,
  viewerId: string,
  blockedIds: Set<string>,
): boolean {
  if (
    game.participants.some(
      (participant) =>
        participant.userId === viewerId &&
        (participant.role === ParticipantRole.OWNER ||
          participant.status === ParticipantStatus.PLAYING ||
          participant.status === ParticipantStatus.INVITED ||
          participant.status === ParticipantStatus.IN_QUEUE),
    )
  ) {
    return true;
  }
  const owner = game.participants.find(
    (participant) => participant.role === ParticipantRole.OWNER,
  );
  return !!owner && blockedIds.has(owner.userId);
}

export async function listMatchingGamesForIntent(input: {
  viewerId: string;
  cityId: string;
  sport: Sport;
  entityType: EntityType;
  timezone: string;
  now: Date;
  criteria: IntentCriteria;
  blockedIds: Set<string>;
}): Promise<MatchingLobbyGame[]> {
  const dateBounds = futureGameDateBounds(
    input.criteria.dateKeys,
    input.timezone,
    input.now,
  );
  if (dateBounds.length === 0) return [];

  const entityTypes = radarEntityTypes(input.entityType);
  const rows = (await prisma.game.findMany({
    where: {
      cityId: input.cityId,
      sport: input.sport,
      isPublic: true,
      timeIsSet: true,
      entityType: { in: entityTypes },
      status: { in: ['ANNOUNCED', 'STARTED'] },
      OR: dateBounds.map((bound) => ({ startTime: bound })),
      participants: {
        none: {
          userId: input.viewerId,
          OR: [
            { role: ParticipantRole.OWNER },
            {
              status: {
                in: [
                  ParticipantStatus.PLAYING,
                  ParticipantStatus.INVITED,
                  ParticipantStatus.IN_QUEUE,
                ],
              },
            },
          ],
        },
      },
    },
    include: {
      club: { select: { id: true, name: true } },
      participants: {
        select: {
          userId: true,
          role: true,
          status: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              avatar: true,
              gender: true,
            },
          },
        },
      },
    },
    orderBy: { startTime: 'asc' },
  })) as ListedGame[];

  const eligible: Array<
    ListedGame & { openSlots: number; matchScore: number }
  > = [];

  for (const game of rows) {
    if (viewerBlocksGame(game, input.viewerId, input.blockedIds)) continue;
    const playing = playingOf(game);
    const openSlots = Math.max(0, (game.maxParticipants || 0) - playing.length);
    if (!hasOpenPlayingSlot(playing.length, game.maxParticipants || 0)) continue;
    if (
      !mixPairsSeatIsFree(
        game.genderTeams,
        input.criteria.userGender,
        playing.map((participant) => participant.user.gender),
        game.maxParticipants || 0,
      )
    ) {
      continue;
    }

    const dateKey = formatInTimeZone(game.startTime, input.timezone, 'yyyy-MM-dd');
    const startMinutes = timeStringToMinutes(
      formatInTimeZone(game.startTime, input.timezone, 'HH:mm'),
    );
    const gameCriteria = {
      entityType: game.entityType,
      dateKey,
      clubId: game.clubId,
      startTime: game.startTime,
      startTimeMinutes: startMinutes,
      minLevel: game.minLevel,
      maxLevel: game.maxLevel,
      genderTeams: game.genderTeams,
    };
    if (!intentMatchesGame(input.criteria, gameCriteria, input.now)) continue;
    eligible.push({
      ...game,
      openSlots,
      matchScore: gameMatchScore(input.criteria, gameCriteria, input.now).score,
    });
  }

  return rankMatchingGames(eligible, MATCHING_GAMES_VISIBLE_CAP).map((game) => ({
    id: game.id,
    entityType: game.entityType,
    allowDirectJoin: game.allowDirectJoin,
    genderTeams: game.genderTeams,
    startTime: game.startTime.toISOString(),
    timeLabel: formatInTimeZone(game.startTime, input.timezone, 'HH:mm'),
    club: game.club,
    maxParticipants: game.maxParticipants || 0,
    playingCount: playingOf(game).length,
    playingAvatars: playingFaces(game),
    ownerAvatar: ownerFace(game),
  }));
}
