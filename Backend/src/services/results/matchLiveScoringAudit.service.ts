import prisma from '../../config/database';
import type { LiveScoringReasonCode } from './liveScoringEngine/liveScoringRejectReasons';

export type MatchLiveScoringAuditSource =
  | 'LIVE_PATCH'
  | 'LIVE_PATCH_REJECT'
  | 'TABLE_PUT'
  | 'SYSTEM_CLEAR';

export async function appendMatchLiveScoringAudit(params: {
  matchId: string;
  gameId: string;
  source: MatchLiveScoringAuditSource;
  userId?: string | null;
  revisionBefore?: number | null;
  revisionAfter?: number | null;
  clientMessageId?: string | null;
  opId?: string | null;
  reasonCode?: LiveScoringReasonCode | null;
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
        reasonCode: params.reasonCode ?? null,
      },
    });
  } catch (e) {
    console.warn('[MatchLiveScoringAudit] insert failed', {
      matchId: params.matchId,
      gameId: params.gameId,
      source: params.source,
      reasonCode: params.reasonCode ?? null,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
