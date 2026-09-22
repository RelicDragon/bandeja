import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';

/** All score writers take this lock before reading the state they will replace. */
export async function lockGameResults(tx: Prisma.TransactionClient, gameId: string): Promise<void> {
  const { BracketAdvancementService } = await import('../league/bracketAdvancement.service');
  await BracketAdvancementService.lockRoundForBracketGame(gameId, tx);
  await tx.$queryRaw`SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE`;
}

function stable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, stable(v)]));
  }
  return value;
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

type VersionedMatch = {
  id: string;
  updatedAt?: Date | string;
  courtId?: string | null;
  metadata?: unknown;
  sets: Array<{ setNumber: number; teamAScore: number; teamBScore: number; isTieBreak: boolean; role?: string }>;
  teams: Array<{ teamNumber: number; players: Array<{ userId: string }> }>;
};

export function matchResultsVersion(match: VersionedMatch): string {
  return fingerprint({
    id: match.id, updatedAt: match.updatedAt, courtId: match.courtId ?? null, metadata: match.metadata ?? null,
    sets: [...match.sets].sort((a, b) => a.setNumber - b.setNumber).map(s => [s.setNumber, s.teamAScore, s.teamBScore, s.isTieBreak, s.role]),
    teams: [...match.teams].sort((a, b) => a.teamNumber - b.teamNumber).map(t => [t.teamNumber, t.players.map(p => p.userId).sort()]),
  });
}

export function withResultsVersions<T extends { resultsStatus: string; rounds: Array<{ id: string; roundNumber: number; matches: VersionedMatch[] }> }>(game: T) {
  const rounds = game.rounds.map(round => ({ ...round, matches: round.matches.map(match => ({ ...match, resultsVersion: matchResultsVersion(match) })) }));
  return { ...game, rounds, resultsVersion: fingerprint({
    status: game.resultsStatus,
    rounds: rounds.map(round => [round.id, round.roundNumber, round.matches.map(match => [match.id, match.resultsVersion])]),
  }) };
}

export function assertResultsVersion(expected: unknown, current: string): void {
  if (expected !== current) {
    throw new ApiError(409, 'Scores changed on another device. Reload the latest results before making a correction.', true, {
      reasonCode: 'RESULTS_VERSION_MISMATCH', resultsVersion: current,
    });
  }
}
