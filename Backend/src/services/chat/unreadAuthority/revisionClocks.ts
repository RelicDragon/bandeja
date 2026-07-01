import type { Prisma } from '@prisma/client';
import type { BumpUnreadRevisionsParams, UnreadAuthorityClock } from './types';

export async function bumpUnreadRevisions(
  tx: Prisma.TransactionClient,
  params: BumpUnreadRevisionsParams
): Promise<UnreadAuthorityClock> {
  const userState = await tx.userUnreadState.upsert({
    where: { userId: params.userId },
    create: {
      userId: params.userId,
      unreadRevision: 1,
    },
    update: {
      unreadRevision: { increment: 1 },
    },
    select: { unreadRevision: true },
  });

  const contextState = await tx.userContextUnreadState.upsert({
    where: {
      userId_contextKey: {
        userId: params.userId,
        contextKey: params.contextKey,
      },
    },
    create: {
      userId: params.userId,
      contextKey: params.contextKey,
      contextType: params.contextType,
      contextId: params.contextId,
      unreadRevision: 1,
    },
    update: {
      unreadRevision: { increment: 1 },
      contextType: params.contextType,
      contextId: params.contextId,
    },
    select: { unreadRevision: true },
  });

  return {
    userUnreadRevision: userState.unreadRevision,
    userContextUnreadRevision: contextState.unreadRevision,
  };
}

export async function bumpContextRevisionOnly(
  tx: Prisma.TransactionClient,
  params: BumpUnreadRevisionsParams
): Promise<number> {
  const contextState = await tx.userContextUnreadState.upsert({
    where: {
      userId_contextKey: {
        userId: params.userId,
        contextKey: params.contextKey,
      },
    },
    create: {
      userId: params.userId,
      contextKey: params.contextKey,
      contextType: params.contextType,
      contextId: params.contextId,
      unreadRevision: 1,
    },
    update: {
      unreadRevision: { increment: 1 },
      contextType: params.contextType,
      contextId: params.contextId,
    },
    select: { unreadRevision: true },
  });

  return contextState.unreadRevision;
}

export async function bumpUserRevisionOnly(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<number> {
  const userState = await tx.userUnreadState.upsert({
    where: { userId },
    create: {
      userId,
      unreadRevision: 1,
    },
    update: {
      unreadRevision: { increment: 1 },
    },
    select: { unreadRevision: true },
  });

  return userState.unreadRevision;
}
