import { EntityType, type Prisma } from '@prisma/client';

export function myGamesMembershipWhere(userId: string): Prisma.GameWhereInput {
  return {
    OR: [
      {
        entityType: { not: EntityType.EVENT },
        participants: {
          some: {
            userId,
            status: { not: 'INVITED' },
          },
        },
      },
      {
        entityType: EntityType.EVENT,
        participants: {
          some: {
            userId,
            status: { not: 'INVITED' },
            OR: [{ role: 'OWNER' }, { status: 'PLAYING' }, { lookingForPartner: true }],
          },
        },
      },
    ],
  };
}
