import type { Prisma } from '@prisma/client';
import { USER_SELECT_FIELDS, USER_SPORT_PROFILE_SELECT } from '../../utils/constants';

const userSelectForRoundGeneration = {
  ...USER_SELECT_FIELDS,
  gamesPlayed: true,
  gamesWon: true,
  sportProfiles: { select: USER_SPORT_PROFILE_SELECT },
} as const;

export const gameIncludeForRoundGeneration = {
  participants: {
    include: {
      user: { select: userSelectForRoundGeneration },
    },
  },
  fixedTeams: {
    include: {
      players: {
        include: {
          user: { select: userSelectForRoundGeneration },
        },
      },
    },
    orderBy: { teamNumber: 'asc' as const },
  },
  gameCourts: {
    orderBy: { order: 'asc' as const },
  },
  rounds: {
    include: {
      matches: {
        include: {
          teams: {
            include: {
              players: {
                select: { userId: true },
              },
            },
          },
          sets: {
            orderBy: { setNumber: 'asc' as const },
          },
        },
        orderBy: { matchNumber: 'asc' as const },
      },
    },
    orderBy: { roundNumber: 'asc' as const },
  },
} satisfies Prisma.GameInclude;

export type GameForRoundGeneration = Prisma.GameGetPayload<{
  include: typeof gameIncludeForRoundGeneration;
}>;
