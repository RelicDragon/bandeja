import type { Prisma } from '@prisma/client';
import { EVENT_APPROVAL_STATUS } from '@bandeja/shared/eventApproval';

export function eventDiscoveryVisibilityWhere(viewer: {
  userId?: string;
  isAdmin?: boolean;
}): Prisma.GameWhereInput {
  const extra: Prisma.GameWhereInput[] = [];
  if (viewer.isAdmin) {
    extra.push({
      entityType: 'EVENT',
      eventApprovalStatus: EVENT_APPROVAL_STATUS.ON_APPROVE,
    });
  } else if (viewer.userId) {
    extra.push({
      entityType: 'EVENT',
      eventApprovalStatus: EVENT_APPROVAL_STATUS.ON_APPROVE,
      participants: { some: { userId: viewer.userId, role: 'OWNER' } },
    });
  }
  return {
    OR: [
      { entityType: { not: 'EVENT' } },
      {
        entityType: 'EVENT',
        eventApprovalStatus: EVENT_APPROVAL_STATUS.APPROVED,
      },
      ...extra,
    ],
  };
}

export function appendEventDiscoveryVisibility(
  where: Prisma.GameWhereInput,
  viewer: { userId?: string; isAdmin?: boolean },
): Prisma.GameWhereInput {
  const and: Prisma.GameWhereInput[] = Array.isArray(where.AND)
    ? [...where.AND]
    : where.AND
      ? [where.AND]
      : [];
  and.push(eventDiscoveryVisibilityWhere(viewer));
  where.AND = and;
  return where;
}
