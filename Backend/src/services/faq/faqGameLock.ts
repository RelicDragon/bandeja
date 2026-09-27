import type { Prisma } from '@prisma/client';

/** Serialize a game's FAQ set and snapshot-sensitive translation submission. */
export async function lockFaqGame(tx: Prisma.TransactionClient, gameId: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('game-faq'), hashtext(${gameId}))::text`;
}
