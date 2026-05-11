import prisma from '../../config/database';

export type MatchLiveScoringAuditSource = 'LIVE_PATCH' | 'TABLE_PUT' | 'SYSTEM_CLEAR';

export async function appendMatchLiveScoringAudit(params: {
  matchId: string;
  gameId: string;
  source: MatchLiveScoringAuditSource;
  userId?: string | null;
  revisionBefore?: number | null;
  revisionAfter?: number | null;
  clientMessageId?: string | null;
  opId?: string | null;
}): Promise<void> {
  try {
    await prisma.matchLiveScoringAudit.create({
      data: {
        matchId: params.matchId,
        gameId: params.gameId,
        source: params.source,
        userId: params.userId ?? null,
        revisionBefore: params.revisionBefore ?? null,
        revisionAfter: params.revisionAfter ?? null,
        clientMessageId: params.clientMessageId ?? null,
        opId: params.opId ?? null,
      },
    });
  } catch (e) {
    console.warn('[MatchLiveScoringAudit] insert failed', {
      matchId: params.matchId,
      gameId: params.gameId,
      source: params.source,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
