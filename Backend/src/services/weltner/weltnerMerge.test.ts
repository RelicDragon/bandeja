import assert from 'node:assert/strict';
import type { Prisma, UserClubWeltnerAuth, WeltnerBooking, WeltnerBookingState } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { mergeWeltnerAccounts } from './weltnerMerge';

function receipt(id: string, userId: string, state: WeltnerBookingState): WeltnerBooking {
  return {
    id, userId, state, clubId: 'club', courtId: 'court', date: '2026-09-22',
    startTime: '20:00', durationMinutes: 90,
    bookingStart: new Date('2026-09-22T18:00:00Z'),
    bookingEnd: new Date('2026-09-22T19:30:00Z'),
    upstreamBookingId: state === 'CONFIRMED' ? 'provider-reference' : null,
    createdAt: new Date('2026-09-21T08:00:00Z'), updatedAt: new Date('2026-09-21T08:00:00Z'),
  };
}

function contact(userId: string, clubId: string, phoneNumber: string): UserClubWeltnerAuth {
  return { id: `${userId}:${clubId}`, userId, clubId, phoneNumber, updatedAt: new Date() };
}

function store(receipts: WeltnerBooking[], contacts: UserClubWeltnerAuth[] = []) {
  const operations: string[] = [];
  const tx = {
    $queryRaw: async (sql: TemplateStringsArray, ...ids: string[]) => {
      assert.match(sql.join('?'), /ORDER BY "id" FOR UPDATE/);
      assert.deepEqual(ids, ['target', 'source']);
      operations.push('lock-users');
      return ids.map((id) => ({ id }));
    },
    weltnerBooking: {
      findMany: async () => {
        assert.equal(operations[0], 'lock-users');
        return receipts;
      },
      updateMany: async ({ where, data }: { where: { userId: string }; data: { userId: string } }) => {
        operations.push('transfer-receipts');
        for (const row of receipts) if (row.userId === where.userId) row.userId = data.userId;
      },
    },
    userClubWeltnerAuth: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        contacts.filter((row) => row.userId === where.userId),
      upsert: async ({ create, update }: {
        create: { userId: string; clubId: string; phoneNumber: string }; update: object;
      }) => {
        assert.deepEqual(update, {}, 'a target contact must never be overwritten');
        operations.push('transfer-contact');
        if (!contacts.some((row) => row.userId === create.userId && row.clubId === create.clubId)) {
          contacts.push(contact(create.userId, create.clubId, create.phoneNumber));
        }
      },
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        operations.push('remove-source-contacts');
        for (let i = contacts.length - 1; i >= 0; i--) {
          if (contacts[i].userId === where.userId) contacts.splice(i, 1);
        }
      },
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, receipts, contacts, operations };
}

async function main() {
  const states: WeltnerBookingState[] = ['CONFIRMED', 'UNKNOWN', 'SUBMITTING', 'REJECTED'];
  const source = states.map((state, index) => ({ ...receipt(`source-${state}`, 'source', state), courtId: `court-${index}` }));
  const unrelated = receipt('other-account', 'other', 'UNKNOWN');
  const db = store([...source, unrelated], [
    contact('source', 'new-club', '+381601111111'),
    contact('source', 'shared-club', '+381602222222'),
    contact('target', 'shared-club', '+381603333333'),
    contact('other', 'shared-club', '+381604444444'),
  ]);
  const original = structuredClone(source);
  await mergeWeltnerAccounts(db.tx, 'target', 'source');
  assert.deepEqual(db.receipts.slice(0, source.length), original.map((r) => ({ ...r, userId: 'target' })),
    'all states transfer with the same receipt ids, timestamps and provider references');
  assert.equal(unrelated.userId, 'other');
  assert.equal(db.contacts.find((r) => r.userId === 'target' && r.clubId === 'new-club')?.phoneNumber, '+381601111111');
  assert.equal(db.contacts.find((r) => r.userId === 'target' && r.clubId === 'shared-club')?.phoneNumber, '+381603333333');
  assert.equal(db.contacts.some((r) => r.userId === 'source'), false);
  assert.equal(db.contacts.find((r) => r.userId === 'other')?.phoneNumber, '+381604444444');

  // An UNKNOWN or SUBMITTING row must survive even when the other account has
  // a confirmed/rejected row for exactly the same key. Never choose a winner.
  for (const sourceState of states) {
    for (const targetState of states) {
      const collision = store([
        receipt('source-receipt', 'source', sourceState),
        receipt('target-receipt', 'target', targetState),
      ], [contact('source', 'club', '+381605555555')]);
      const before = structuredClone({ receipts: collision.receipts, contacts: collision.contacts });
      await assert.rejects(mergeWeltnerAccounts(collision.tx, 'target', 'source'),
        (error: unknown) => error instanceof ApiError && error.statusCode === 409);
      assert.deepEqual({ receipts: collision.receipts, contacts: collision.contacts }, before);
      assert.deepEqual(collision.operations, ['lock-users'], 'conflict must precede all mutations');
    }
  }

  const distinct = store([
    receipt('target-receipt', 'target', 'CONFIRMED'),
    { ...receipt('source-receipt', 'source', 'UNKNOWN'), durationMinutes: 120 },
  ]);
  await mergeWeltnerAccounts(distinct.tx, 'target', 'source');
  assert.equal(distinct.receipts[1].state, 'UNKNOWN');
  assert.equal(distinct.receipts[1].userId, 'target');
  console.log('Weltner merge preserves receipt ids/states and contact isolation; all 16 collision state pairs reject without mutation');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
