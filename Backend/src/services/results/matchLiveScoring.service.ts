import { MatchSetRole, Prisma, ResultsStatus } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { canModifyResults } from '../../utils/parentGamePermissions';
import { calculateGameStatus } from '../../utils/gameStatus';
import { getUserTimezoneFromCityId } from '../user-timezone.service';
import {
  MATCH_LIVE_SCORING_V,
  type MatchLiveScoringEnvelopeV1,
  isLiveScoringEnvelopeV1,
} from './matchLiveScoring.types';
import { assertMatchNormalizedSetsValid, type NormalizedMatchSetRow } from './matchSetsValidation';

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

function readSetsFromState(state: Record<string, unknown> | null): NormalizedMatchSetRow[] | null {
  if (!state || !Array.isArray(state.sets) || state.sets.length === 0) return null;
  return state.sets.map((raw) => {
    const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const role =
      o.role === MatchSetRole.EXTRA_GAMES || o.role === MatchSetRole.EXTRA_BALLS
        ? o.role
        : MatchSetRole.OFFICIAL;
    return {
      teamA: Math.max(0, Math.min(9999, Number(o.teamA) || 0)),
      teamB: Math.max(0, Math.min(9999, Number(o.teamB) || 0)),
      isTieBreak: Boolean(o.isTieBreak),
      role,
    };
  }) as NormalizedMatchSetRow[];
}

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

  const conflictPayload = (): Record<string, unknown> => ({
    revision: currentRevision,
    ...(current ? { liveScoring: current as unknown as Record<string, unknown> } : {}),
  });

  const base = body.baseRevision;
  if (currentRevision === 0) {
    if (base != null && base !== 0) {
      throw new ApiError(409, 'Live scoring revision mismatch', true, conflictPayload());
    }
  } else if (base !== currentRevision) {
    throw new ApiError(409, 'Live scoring revision mismatch', true, conflictPayload());
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

  const liveSets = readSetsFromState(body.state);

  if (liveSets) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        scoringPreset: true,
        fixedNumberOfSets: true,
        ballsInGames: true,
        winnerOfMatch: true,
        matchTimerEnabled: true,
      },
    });
    if (!game) {
      throw new ApiError(404, 'Game not found');
    }
    assertMatchNormalizedSetsValid(game, liveSets);
  }

  await prisma.$transaction(async (tx) => {
    if (liveSets) {
      await tx.set.deleteMany({ where: { matchId } });
      for (let i = 0; i < liveSets.length; i += 1) {
        const s = liveSets[i];
        await tx.set.create({
          data: {
            matchId,
            setNumber: i + 1,
            teamAScore: s.teamA,
            teamBScore: s.teamB,
            isTieBreak: s.isTieBreak,
            role: s.role,
          },
        });
      }
    }

    await tx.match.update({
      where: { id: matchId },
      data: { metadata: prevMeta as Prisma.InputJsonValue },
    });
  });

  if (liveSets && body.state) {
    const gameRow = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        resultsStatus: true,
        startTime: true,
        endTime: true,
        timeIsSet: true,
        entityType: true,
        cityId: true,
      },
    });
    if (gameRow && gameRow.resultsStatus !== ResultsStatus.FINAL && gameRow.resultsStatus !== ResultsStatus.IN_PROGRESS) {
      const cityTimezone = await getUserTimezoneFromCityId(gameRow.cityId);
      await prisma.game.update({
        where: { id: gameId },
        data: {
          resultsStatus: ResultsStatus.IN_PROGRESS,
          finishedDate: null,
          status: calculateGameStatus(
            {
              startTime: gameRow.startTime,
              endTime: gameRow.endTime,
              resultsStatus: 'IN_PROGRESS',
              timeIsSet: gameRow.timeIsSet,
              entityType: gameRow.entityType,
              finishedDate: null,
            },
            cityTimezone
          ),
        },
      });
    }
  }

  emitSocket(gameId, matchId, envelope);

  return { liveScoring: envelope, revision: nextRevision };
}
