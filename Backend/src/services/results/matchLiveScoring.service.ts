import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { canModifyResults } from '../../utils/parentGamePermissions';
import {
  MATCH_LIVE_SCORING_V,
  type MatchLiveScoringEnvelopeV1,
  isLiveScoringEnvelopeV1,
} from './matchLiveScoring.types';

export function stripLiveScoringFromMatchMetadata(metadata: unknown): Prisma.InputJsonValue {
  if (metadata == null) return {};
  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    return metadata as Prisma.InputJsonValue;
  }
  const o = { ...(metadata as Record<string, unknown>) };
  delete o.liveScoring;
  return o as Prisma.InputJsonValue;
}

function readEnvelope(metadata: unknown): MatchLiveScoringEnvelopeV1 | null {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const ls = (metadata as Record<string, unknown>).liveScoring;
  return isLiveScoringEnvelopeV1(ls) ? ls : null;
}

function emitSocket(gameId: string, matchId: string, envelope: MatchLiveScoringEnvelopeV1 | null) {
  const socket = (globalThis as typeof globalThis & {
    socketService?: { emitMatchLiveScoringUpdated?: (g: string, m: string, p: unknown) => void };
  }).socketService;
  socket?.emitMatchLiveScoringUpdated?.(gameId, matchId, envelope);
}

export function notifyMatchLiveScoringCleared(gameId: string, matchId: string) {
  emitSocket(gameId, matchId, null);
}

export type PatchMatchLiveScoringBody = {
  state: Record<string, unknown> | null;
  baseRevision: number | null;
  clientMessageId?: string;
};

export async function patchMatchLiveScoring(
  gameId: string,
  matchId: string,
  userId: string,
  isAdmin: boolean,
  body: PatchMatchLiveScoringBody
): Promise<{ liveScoring: MatchLiveScoringEnvelopeV1 | null; revision: number }> {
  await canModifyResults(gameId, userId, isAdmin);

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, metadata: true, round: { select: { gameId: true } } },
  });

  if (!match) {
    throw new ApiError(404, 'Match not found');
  }
  if (match.round.gameId !== gameId) {
    throw new ApiError(400, 'Match does not belong to the specified game');
  }

  const current = readEnvelope(match.metadata);
  const currentRevision = current?.revision ?? 0;

  if (body.clientMessageId && current?.lastClientMessageId === body.clientMessageId) {
    return { liveScoring: current, revision: currentRevision };
  }

  const base = body.baseRevision;
  if (currentRevision === 0) {
    if (base != null && base !== 0) {
      throw new ApiError(409, 'Live scoring revision mismatch', true, { revision: currentRevision });
    }
  } else if (base !== currentRevision) {
    throw new ApiError(409, 'Live scoring revision mismatch', true, { revision: currentRevision });
  }

  const nextRevision = currentRevision + 1;
  const envelope: MatchLiveScoringEnvelopeV1 = {
    v: MATCH_LIVE_SCORING_V,
    revision: nextRevision,
    updatedAt: new Date().toISOString(),
    writerUserId: userId,
    lastClientMessageId: body.clientMessageId,
    state: body.state,
  };

  const prevMeta =
    match.metadata == null || typeof match.metadata !== 'object' || Array.isArray(match.metadata)
      ? {}
      : { ...(match.metadata as Record<string, unknown>) };
  prevMeta.liveScoring = envelope as unknown as Prisma.JsonObject;

  await prisma.match.update({
    where: { id: matchId },
    data: { metadata: prevMeta as Prisma.InputJsonValue },
  });

  emitSocket(gameId, matchId, envelope);

  return { liveScoring: envelope, revision: nextRevision };
}
