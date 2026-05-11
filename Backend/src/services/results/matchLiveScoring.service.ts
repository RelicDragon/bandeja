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
import { getRules } from './liveScoringEngine/rulebook';
import { isLiveScoringTransitionWithinSteps } from './liveScoringEngine/liveScoringTransitionVerify';
import type { SetResult } from './liveScoringEngine/types';
import { appendMatchLiveScoringAudit } from './matchLiveScoringAudit.service';

export function stripLiveScoringFromMatchMetadata(metadata: unknown): Prisma.InputJsonValue {
  if (metadata == null) return {};
  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    return metadata as Prisma.InputJsonValue;
  }
  const o = { ...(metadata as Record<string, unknown>) };
  delete o.liveScoring;
  return o as Prisma.InputJsonValue;
}

export function readMatchLiveScoringEnvelope(metadata: unknown): MatchLiveScoringEnvelopeV1 | null {
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
  opId?: string;
};

const OP_DEDUPE_MAX = 32;
const TRANSITION_MAX_DEPTH = 8;

function sanitizeOptionalIdempotencyKey(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new ApiError(400, 'Invalid idempotency key');
  }
  const t = value.trim();
  if (!t) return undefined;
  if (t.length > 128) {
    throw new ApiError(400, 'Invalid idempotency key');
  }
  if (!/^[A-Za-z0-9._-]+$/.test(t)) {
    throw new ApiError(400, 'Invalid idempotency key');
  }
  return t;
}

function looksLikeStructuredLiveState(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const o = raw as Record<string, unknown>;
  return (
    (o.mode === 'classic' || o.mode === 'points') &&
    Array.isArray(o.sets) &&
    o.sets.length > 0 &&
    typeof o.activeSetIndex === 'number'
  );
}

function setResultsFromNormalized(rows: NormalizedMatchSetRow[] | null): SetResult[] {
  if (!rows?.length) return [{ teamA: 0, teamB: 0, isTieBreak: false }];
  return rows.map((r) => ({
    teamA: r.teamA,
    teamB: r.teamB,
    isTieBreak: r.isTieBreak,
    role: r.role,
  }));
}

export function normalizedMatchSetRowsEqual(a: NormalizedMatchSetRow[], b: NormalizedMatchSetRow[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (x.teamA !== y.teamA || x.teamB !== y.teamB || x.isTieBreak !== y.isTieBreak || x.role !== y.role) {
      return false;
    }
  }
  return true;
}

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

/** Sets grid from `metadata.liveScoring.state`, normalized the same way as PATCH live-scoring. */
export function readNormalizedSetsFromLiveMetadata(metadata: unknown): NormalizedMatchSetRow[] | null {
  const env = readMatchLiveScoringEnvelope(metadata);
  if (!env?.state) return null;
  return readSetsFromState(env.state);
}

export async function patchMatchLiveScoring(
  gameId: string,
  matchId: string,
  userId: string,
  isAdmin: boolean,
  body: PatchMatchLiveScoringBody
): Promise<{ liveScoring: MatchLiveScoringEnvelopeV1 | null; revision: number }> {
  await canModifyResults(gameId, userId, isAdmin);
  const clientMessageId = sanitizeOptionalIdempotencyKey(body.clientMessageId);
  const opId = sanitizeOptionalIdempotencyKey(body.opId);

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

  const current = readMatchLiveScoringEnvelope(match.metadata);
  const currentRevision = current?.revision ?? 0;

  if (clientMessageId && current?.lastClientMessageId === clientMessageId) {
    return { liveScoring: current, revision: currentRevision };
  }

  const prevOpIds = Array.isArray(current?.recentOpIds)
    ? current.recentOpIds.filter((x): x is string => typeof x === 'string')
    : [];
  if (opId && prevOpIds.includes(opId)) {
    if (!current) {
      throw new ApiError(409, 'Live scoring revision mismatch', true, { revision: 0 });
    }
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

  const liveSets = readSetsFromState(body.state);

  const gameForRules = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      scoringPreset: true,
      fixedNumberOfSets: true,
      maxTotalPointsPerSet: true,
      maxPointsPerTeam: true,
      winnerOfMatch: true,
      ballsInGames: true,
      hasGoldenPoint: true,
      pointsPerTie: true,
      matchTimerEnabled: true,
    },
  });
  if (!gameForRules) {
    throw new ApiError(404, 'Game not found');
  }

  if (liveSets) {
    assertMatchNormalizedSetsValid(gameForRules, liveSets, { skipClassicGameScoreValidation: true });
  }

  if (
    currentRevision > 0 &&
    current?.state &&
    body.state &&
    looksLikeStructuredLiveState(current.state) &&
    looksLikeStructuredLiveState(body.state) &&
    !isLiveScoringTransitionWithinSteps(
      current.state,
      body.state,
      getRules(gameForRules),
      setResultsFromNormalized(liveSets ?? readSetsFromState(current.state)),
      TRANSITION_MAX_DEPTH
    )
  ) {
    throw new ApiError(400, 'Live scoring state transition is not valid');
  }

  const nextRevision = currentRevision + 1;
  const nextOpIds = opId
    ? [...prevOpIds.filter((id) => id !== opId), opId].slice(-OP_DEDUPE_MAX)
    : prevOpIds.slice(-OP_DEDUPE_MAX);

  const envelope: MatchLiveScoringEnvelopeV1 = {
    v: MATCH_LIVE_SCORING_V,
    revision: nextRevision,
    updatedAt: new Date().toISOString(),
    writerUserId: userId,
    lastClientMessageId: clientMessageId,
    ...(nextOpIds.length ? { recentOpIds: nextOpIds } : {}),
    state: body.state,
  };

  const prevMeta =
    match.metadata == null || typeof match.metadata !== 'object' || Array.isArray(match.metadata)
      ? {}
      : { ...(match.metadata as Record<string, unknown>) };
  prevMeta.liveScoring = envelope as unknown as Prisma.JsonObject;

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

  void appendMatchLiveScoringAudit({
    matchId,
    gameId,
    source: 'LIVE_PATCH',
    userId,
    revisionBefore: currentRevision,
    revisionAfter: nextRevision,
    clientMessageId: clientMessageId ?? null,
    opId: opId ?? null,
  });

  return { liveScoring: envelope, revision: nextRevision };
}
