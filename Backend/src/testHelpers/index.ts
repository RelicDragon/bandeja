import assert from 'node:assert/strict';
import {
  EntityType,
  GameStatus,
  ParticipantRole,
  ResultsStatus,
  type Bet,
  type BetType,
  type PrismaClient,
} from '@prisma/client';
import { ApiError } from '../utils/ApiError';
import type { BetCondition } from '../services/bets/betConditionEvaluator.service';

export function ensureDbUrl(): boolean {
  let url = process.env.DB_URL;
  if (!url) return false;
  if (!/[?&]schema=/.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'schema=padelpulse';
    process.env.DB_URL = url;
  }
  return true;
}

export async function expectApiError(
  fn: () => Promise<unknown>,
  statusCode: number,
  message: string,
): Promise<void> {
  try {
    await fn();
    assert.fail('expected ApiError');
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    assert.equal(err.statusCode, statusCode);
    assert.equal(err.message, message);
  }
}

export type TestUserRow = { id: string };

export async function createTestUser(
  prisma: PrismaClient,
  label: string,
  suffix: string,
  wallet: number,
): Promise<TestUserRow> {
  const tag = `${label}-${suffix}`;
  return prisma.user.create({
    data: {
      phone: `qa-${tag}`,
      email: `qa-${tag}@test.local`,
      firstName: 'QA',
      lastName: label,
      wallet,
      isActive: true,
    },
    select: { id: true },
  });
}

export type CreateTestGameOptions = {
  gameId: string;
  cityId: string;
  participantIds: string[];
  status?: GameStatus;
  resultsStatus?: ResultsStatus;
  finishedDate?: Date | null;
  resultsSentToTelegram?: boolean;
};

export async function createTestGame(
  prisma: PrismaClient,
  opts: CreateTestGameOptions,
): Promise<void> {
  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 3_600_000);
  await prisma.game.create({
    data: {
      id: opts.gameId,
      entityType: EntityType.GAME,
      gameType: 'CLASSIC',
      cityId: opts.cityId,
      startTime: start,
      endTime: end,
      timeIsSet: true,
      status: opts.status ?? GameStatus.ANNOUNCED,
      resultsStatus: opts.resultsStatus ?? ResultsStatus.NONE,
      finishedDate: opts.finishedDate ?? undefined,
      resultsSentToTelegram: opts.resultsSentToTelegram ?? false,
      participants: {
        create: opts.participantIds.map((userId, i) => ({
          userId,
          role: i === 0 ? ParticipantRole.OWNER : ParticipantRole.PARTICIPANT,
          status: 'PLAYING' as const,
        })),
      },
    },
  });
}

export type CreateTestBetOptions = {
  gameId: string;
  creatorId: string;
  condition: BetCondition;
  type: BetType;
  stakeCoins: number;
  rewardCoins?: number | null;
  stakeText?: string | null;
  rewardText?: string | null;
};

export async function createTestBet(opts: CreateTestBetOptions): Promise<Bet> {
  const { BetService } = await import('../services/bets/bet.service');
  const isSocial = opts.type === 'SOCIAL';
  return BetService.createBet(
    opts.gameId,
    opts.creatorId,
    opts.condition,
    opts.type,
    'COINS',
    opts.stakeCoins,
    opts.stakeText ?? null,
    'COINS',
    isSocial ? (opts.rewardCoins ?? opts.stakeCoins) : (opts.rewardCoins ?? 0),
    opts.rewardText ?? null,
  );
}
