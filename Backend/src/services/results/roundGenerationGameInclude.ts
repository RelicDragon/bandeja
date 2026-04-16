import type { Prisma } from '@prisma/client';
import { USER_SELECT_FIELDS } from '../../utils/constants';

export const gameIncludeForRoundGeneration = {
  participants: {
    include: {
      user: { select: USER_SELECT_FIELDS },
    },
  },
  fixedTeams: {
    include: {
      players: {
        include: {
          user: { select: USER_SELECT_FIELDS },
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
