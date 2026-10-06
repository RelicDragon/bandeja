/**
 * Test kit for the club admin console integration tests: an in-process HTTP server with the
 * real `/club-admin` + `/courts` routers and error handler, bearer tokens for fixture users,
 * and namespaced fixtures that are removed in `cleanup()`. Safe against `padelpulse_dev`.
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { EntityType, GameType, ParticipantRole, ParticipantStatus, Sport } from '@prisma/client';
import prisma from '../../../config/database';
import clubAdminRoutes from '../../../routes/clubAdmin.routes';
import courtRoutes from '../../../routes/court.routes';
import { errorHandler } from '../../../middleware/errorHandler';
import { generateShortAccessToken } from '../../../utils/jwt';

process.env.E2E_TEST = '1';

export const MIN = 60_000;
export const H = 60 * MIN;

export interface ApiResult {
  status: number;
  body: { success?: boolean; message?: string; code?: string; details?: unknown; data?: any };
}

export async function startServer() {
  const app = express();
  // Each request carries its own X-Forwarded-For so the per-IP mutate limiter never trips.
  app.set('trust proxy', true);
  app.use(express.json());
  app.use('/api/club-admin', clubAdminRoutes);
  app.use('/api/courts', courtRoutes);
  app.use(errorHandler);
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}/api`;
  let ipCounter = 1;
  const call = async (userId: string | null, method: string, path: string, body?: unknown): Promise<ApiResult> => {
    ipCounter += 1;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-forwarded-for': `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`,
    };
    if (userId) headers.authorization = `Bearer ${generateShortAccessToken({ userId })}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : {} };
  };
  return {
    call,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export async function createFixtures(tag: string, opts: { timezoneA?: string; timezoneB?: string } = {}) {
  const suffix = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const userIds: string[] = [];
  const cityIds: string[] = [];
  const clubIds: string[] = [];

  const city = async (timezone: string) => {
    const row = await prisma.city.create({ data: { name: `CA ${suffix} ${timezone}`, country: 'Test', timezone } });
    cityIds.push(row.id);
    return row;
  };
  const user = async (name: string, extra: { isAdmin?: boolean } = {}) => {
    const row = await prisma.user.create({
      data: { phone: `qa-ca-${name}-${suffix}`, firstName: name, primarySport: Sport.PADEL, isAdmin: extra.isAdmin ?? false },
    });
    userIds.push(row.id);
    return row;
  };
  const club = async (name: string, cityId: string) => {
    const row = await prisma.club.create({
      data: { name: `${name} ${suffix}`, normalizedName: `${name} ${suffix}`.toLowerCase(), address: 'x', cityId },
    });
    clubIds.push(row.id);
    return row;
  };

  const cityA = await city(opts.timezoneA ?? 'Europe/Belgrade');
  const cityB = await city(opts.timezoneB ?? 'UTC');
  const clubA = await club('Club A', cityA.id);
  const clubB = await club('Club B', cityB.id);
  const [a1, a2] = await Promise.all(
    ['A1', 'A2'].map((name) => prisma.court.create({ data: { name, clubId: clubA.id, sport: Sport.PADEL } }))
  );
  const b1 = await prisma.court.create({ data: { name: 'B1', clubId: clubB.id, sport: Sport.PADEL } });
  const adminA = await user('adminA');
  const staffA = await user('staffA');
  const adminB = await user('adminB');
  const platform = await user('platform', { isAdmin: true });
  const owner = await user('owner');
  const stranger = await user('stranger');
  await prisma.clubAdmin.createMany({
    data: [
      { userId: adminA.id, clubId: clubA.id, role: 'ADMIN' },
      { userId: staffA.id, clubId: clubA.id, role: 'STAFF' },
      { userId: adminB.id, clubId: clubB.id, role: 'ADMIN' },
    ],
  });

  const gameIds: string[] = [];
  const makeGame = async (over: {
    clubId?: string | null;
    courtId?: string | null;
    cityId?: string;
    startTime: Date;
    endTime: Date;
    entityType?: EntityType;
    name?: string;
  }) => {
    const game = await prisma.game.create({
      data: {
        entityType: over.entityType ?? EntityType.GAME,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: over.cityId ?? cityA.id,
        clubId: over.clubId === undefined ? clubA.id : over.clubId,
        courtId: over.courtId ?? null,
        startTime: over.startTime,
        endTime: over.endTime,
        timeIsSet: true,
        maxParticipants: 4,
        name: over.name ?? null,
        participants: {
          create: [{ userId: owner.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING }],
        },
      },
    });
    gameIds.push(game.id);
    if (over.courtId) await prisma.gameCourt.create({ data: { gameId: game.id, courtId: over.courtId, order: 1 } });
    return game;
  };

  const cleanup = async () => {
    const swallow = () => undefined;
    await prisma.chatMessage.deleteMany({ where: { contextId: { in: gameIds } } }).catch(swallow);
    await prisma.chatSyncEvent.deleteMany({ where: { contextId: { in: gameIds } } }).catch(swallow);
    await prisma.game.deleteMany({ where: { id: { in: gameIds } } }).catch(swallow);
    await prisma.cancelledGame.deleteMany({ where: { id: { in: gameIds } } }).catch(swallow);
    await prisma.club.deleteMany({ where: { id: { in: clubIds } } }).catch(swallow);
    await prisma.userChat.deleteMany({ where: { OR: [{ user1Id: { in: userIds } }, { user2Id: { in: userIds } }] } }).catch(swallow);
    await prisma.userSportProfile.deleteMany({ where: { userId: { in: userIds } } }).catch(swallow);
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(swallow);
    await prisma.city.deleteMany({ where: { id: { in: cityIds } } }).catch(swallow);
  };

  return { suffix, cityA, cityB, clubA, clubB, a1, a2, b1, adminA, staffA, adminB, platform, owner, stranger, makeGame, gameIds, user, cleanup };
}

export function expectStatus(res: ApiResult, status: number, label: string, code?: string): void {
  if (res.status !== status || (code && res.body.code !== code)) {
    throw new Error(`${label}: expected ${status}${code ? ` ${code}` : ''}, got ${res.status} ${JSON.stringify(res.body).slice(0, 400)}`);
  }
}
