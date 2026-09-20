import assert from 'node:assert/strict';
import type { PrismaClient, WeltnerBooking } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';

async function main() {
  const auths = new Map<string, { phoneNumber: string }>();
  const attempts: WeltnerBooking[] = [];
  const club = {
    id: 'club',
    city: { timezone: 'Europe/Belgrade' },
    courts: [{ id: 'court', externalCourtId: 'teren-1-yucatan' }],
  };
  let gameClubId = 'club';
  const fake = {
    club: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        where.id === club.id ? club : null,
    },
    user: {
      findUnique: async () => ({ firstName: 'Test', lastName: 'Player' }),
    },
    userClubWeltnerAuth: {
      findUnique: async ({
        where: { userId_clubId: key },
      }: {
        where: { userId_clubId: { userId: string; clubId: string } };
      }) => auths.get(`${key.userId}:${key.clubId}`) ?? null,
      upsert: async ({
        create,
      }: {
        create: { userId: string; clubId: string; phoneNumber: string };
      }) => {
        auths.set(`${create.userId}:${create.clubId}`, {
          phoneNumber: create.phoneNumber,
        });
      },
      deleteMany: async ({ where }: { where: { userId: string; clubId: string } }) => {
        auths.delete(`${where.userId}:${where.clubId}`);
      },
    },
    weltnerBooking: {
      findUnique: async ({
        where,
      }: {
        where: {
          userId_clubId_courtId_date_startTime_durationMinutes?: Record<string, unknown>;
          id?: string;
        };
      }) =>
        attempts.find((r) =>
          where.id
            ? r.id === where.id
            : Object.entries(where.userId_clubId_courtId_date_startTime_durationMinutes!).every(
                ([key, value]) => r[key as keyof WeltnerBooking] === value,
              ),
        ) ?? null,
      create: async ({
        data,
      }: {
        data: Omit<
          WeltnerBooking,
          'id' | 'state' | 'createdAt' | 'updatedAt' | 'upstreamBookingId'
        >;
      }) => {
        const row: WeltnerBooking = {
          ...data,
          id: String(attempts.length + 1),
          state: 'SUBMITTING',
          upstreamBookingId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        attempts.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<WeltnerBooking> }) =>
        Object.assign(attempts.find((r) => r.id === where.id)!, data),
    },
    game: { findUnique: async () => ({ clubId: gameClubId }) },
  };
  // Install only an in-memory test database before the service loads its singleton.
  const globalDb = globalThis as typeof globalThis & { prisma?: PrismaClient };
  globalDb.prisma = fake as unknown as PrismaClient;
  const service = await import('./weltner.service');
  const { weltnerBookingLinkData } = await import('./weltnerBookingLinks');
  const originalFetch = globalThis.fetch;
  let posts = 0;
  const date = formatInTimeZone(new Date(Date.now() + 86400000), 'Europe/Belgrade', 'yyyy-MM-dd');
  const input = {
    userId: 'alice',
    clubId: 'club',
    courtId: 'court',
    date,
    startTime: '22:00',
    durationMinutes: 120,
  };
  try {
    await service.saveWeltnerAuth('alice', 'club', '+381 60 1234567');
    assert.equal((await service.getWeltnerAuth('alice', 'club')).phoneNumber, '+381601234567');
    assert.equal((await service.getWeltnerAuth('bob', 'club')).connected, false);
    await assert.rejects(
      service.createWeltnerBooking({ ...input, userId: 'bob' }),
      /connectRequired/,
    );
    globalThis.fetch = async (_url, init) => {
      if (init?.method === 'POST') {
        posts++;
        assert.equal(JSON.parse(String(init.body)).phone, '+381601234567');
        return new Response('{"success":true}');
      }
      return new Response(
        JSON.stringify({
          court: 'teren-1-yucatan',
          date,
          slots: [
            { start: '22:00', end: '00:00', duration: 120 },
            { start: '20:00', end: '22:00', duration: 120 },
          ],
        }),
      );
    };
    const receipt = await service.createWeltnerBooking(input);
    assert.equal(receipt.state, 'CONFIRMED');
    assert.equal(receipt.upstreamBookingId, null);
    assert.equal(
      (await service.createWeltnerBooking(input)).externalBookingId,
      receipt.externalBookingId,
    );
    assert.equal(posts, 1, 'game-save retry reuses receipt without a second POST');
    await assert.rejects(
      weltnerBookingLinkData(fake as never, {
        gameId: 'game',
        userId: 'bob',
        externalBookingId: receipt.externalBookingId,
      }),
      /invalidReceipt/,
    );
    const link = await weltnerBookingLinkData(fake as never, {
      gameId: 'game',
      userId: 'alice',
      externalBookingId: receipt.externalBookingId,
    });
    assert.equal(link.bookingStart.toISOString(), receipt.bookingStart);
    gameClubId = 'different-club';
    await assert.rejects(
      weltnerBookingLinkData(fake as never, {
        gameId: 'game',
        userId: 'alice',
        externalBookingId: receipt.externalBookingId,
      }),
      /invalidReceipt/,
    );
    gameClubId = 'club';
    await assert.rejects(
      weltnerBookingLinkData(fake as never, {
        gameId: 'game',
        userId: 'alice',
        externalBookingId: 'fabricated',
      }),
      /invalidReceipt/,
    );
    globalThis.fetch = async (_url, init) => {
      if (init?.method === 'POST') {
        posts++;
        throw new Error('lost response after write');
      }
      return new Response(
        JSON.stringify({
          court: 'teren-1-yucatan',
          date,
          slots: [{ start: '20:00', end: '22:00', duration: 120 }],
        }),
      );
    };
    await assert.rejects(
      service.createWeltnerBooking({ ...input, startTime: '20:00' }),
      /bookingUnknown/,
    );
    await assert.rejects(
      service.createWeltnerBooking({ ...input, startTime: '20:00' }),
      /bookingUnknown/,
    );
    assert.equal(posts, 2, 'an uncertain attempt blocks repeated submissions');
    await assert.rejects(
      service.createWeltnerBooking({
        ...input,
        startTime: '20:00',
        durationMinutes: 90,
      }),
      /slotNoLongerAvailable/,
    );
    await service.disconnectWeltner('alice', 'club');
    assert.equal((await service.getWeltnerAuth('alice', 'club')).connected, false);
    assert.equal(attempts.length, 2, 'disconnect preserves booking evidence');
  } finally {
    globalThis.fetch = originalFetch;
    delete globalDb.prisma;
  }
  console.log(
    'Weltner saved phone isolation, ownership, exact slots and durable retry checks passed',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
