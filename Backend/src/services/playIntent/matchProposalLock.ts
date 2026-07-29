import { Prisma } from '@prisma/client';

export async function lockMatchProposal(
  tx: Prisma.TransactionClient,
  proposalId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "MatchProposal"
      WHERE "id" = ${proposalId}
      FOR UPDATE
    `,
  );
  return rows.length === 1;
}
