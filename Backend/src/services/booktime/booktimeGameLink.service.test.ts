/**
 * `GET /{booktime,padeloo,klikteren,nspadel}/linked-games/:id` and `POST /booktime/linked-games/batch`
 * used to return every game linked to a provider booking id to any logged-in user. Booking ids are
 * guessable, so the lookup is now scoped to games the caller is on (or manages via the parent).
 *
 * The fake client below evaluates the exact `where` the service sends, so a regression that drops
 * or loosens the viewer filter fails here without a database.
 */
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';

type Participant = { userId: string; role: 'OWNER' | 'ADMIN' | 'PARTICIPANT'; status: string };
type FakeGame = {
  id: string;
  name: string;
  participants: Participant[];
  parent: { participants: Participant[] } | null;
};
type FakeLink = { externalBookingId: string; createdAt: number; game: FakeGame };

type ParticipantFilter = {
  userId: string;
  role?: { in: string[] };
  status: { in: string[] };
};
type GameFilter = {
  OR: (
    | { participants: { some: ParticipantFilter } }
    | { parent: { participants: { some: ParticipantFilter } } }
  )[];
};
type LinkWhere = { externalBookingId: { in: string[] }; game?: GameFilter };

function participantMatches(p: Participant, f: ParticipantFilter): boolean {
  if (p.userId !== f.userId) return false;
  if (f.role && !f.role.in.includes(p.role)) return false;
  return f.status.in.includes(p.status);
}

function gameMatches(game: FakeGame, filter: GameFilter | undefined): boolean {
  if (!filter) return true;
  return filter.OR.some((branch) => {
    if ('participants' in branch) {
      return game.participants.some((p) => participantMatches(p, branch.participants.some));
    }
    return (
      game.parent !== null &&
      game.parent.participants.some((p) => participantMatches(p, branch.parent.participants.some))
    );
  });
}

const game = (
  id: string,
  participants: Participant[],
  parentParticipants: Participant[] | null = null,
): FakeGame => ({
  id,
  name: id,
  participants,
  parent: parentParticipants ? { participants: parentParticipants } : null,
});

const links: FakeLink[] = [
  // Shared reservation: the booker's own game and a stranger's private game.
  { externalBookingId: 'bk-shared', createdAt: 1, game: game('g-mine', [{ userId: 'booker', role: 'OWNER', status: 'PLAYING' }]) },
  { externalBookingId: 'bk-shared', createdAt: 2, game: game('g-private', [{ userId: 'stranger', role: 'OWNER', status: 'PLAYING' }]) },
  // Caller is a plain roster member / trainer / queued / only invited.
  { externalBookingId: 'bk-roster', createdAt: 3, game: game('g-player', [{ userId: 'booker', role: 'PARTICIPANT', status: 'PLAYING' }]) },
  { externalBookingId: 'bk-roster', createdAt: 4, game: game('g-trainer', [{ userId: 'booker', role: 'PARTICIPANT', status: 'NON_PLAYING' }]) },
  { externalBookingId: 'bk-roster', createdAt: 5, game: game('g-queue', [{ userId: 'booker', role: 'PARTICIPANT', status: 'IN_QUEUE' }]) },
  { externalBookingId: 'bk-roster', createdAt: 6, game: game('g-invited', [{ userId: 'booker', role: 'PARTICIPANT', status: 'INVITED' }]) },
  // League fixture: caller runs the season but is not on the fixture roster.
  {
    externalBookingId: 'bk-league',
    createdAt: 7,
    game: game('g-fixture', [], [{ userId: 'booker', role: 'ADMIN', status: 'PLAYING' }]),
  },
  {
    externalBookingId: 'bk-league',
    createdAt: 8,
    game: game('g-fixture-member-only', [], [{ userId: 'booker', role: 'PARTICIPANT', status: 'PLAYING' }]),
  },
];

const seenWheres: LinkWhere[] = [];

const fake = {
  gameExternalBooking: {
    findMany: async ({ where }: { where: LinkWhere }) => {
      seenWheres.push(where);
      return links
        .filter((l) => where.externalBookingId.in.includes(l.externalBookingId))
        .filter((l) => gameMatches(l.game, where.game))
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((l) => ({
          externalBookingId: l.externalBookingId,
          bookingStart: null,
          bookingEnd: null,
          game: {
            id: l.game.id,
            name: l.game.name,
            startTime: new Date(0),
            endTime: new Date(0),
            timeIsSet: true,
            status: 'ANNOUNCED',
          },
        }));
    },
  },
};

async function main() {
  const globalDb = globalThis as typeof globalThis & { prisma?: PrismaClient };
  globalDb.prisma = fake as unknown as PrismaClient;
  const service = await import('./booktimeGameLink.service');

  const booker = { userId: 'booker', isAdmin: false };
  const ids = async (bookingId: string, viewer: { userId: string; isAdmin: boolean }) =>
    (await service.findLinkedGamesForBooking(bookingId, viewer)).map((g) => g.id);

  // An uninvolved user who knows/guesses the booking id learns nothing.
  assert.deepEqual(await ids('bk-shared', { userId: 'snoop', isAdmin: false }), []);
  assert.deepEqual(await ids('bk-league', { userId: 'snoop', isAdmin: false }), []);

  // The booker only sees their own game on a shared reservation, never the stranger's private one.
  assert.deepEqual(await ids('bk-shared', booker), ['g-mine']);
  assert.deepEqual(await ids('bk-shared', { userId: 'stranger', isAdmin: false }), ['g-private']);

  // Any roster status counts (incl. trainer NON_PLAYING and IN_QUEUE); INVITED does not.
  assert.deepEqual(await ids('bk-roster', booker), ['g-player', 'g-trainer', 'g-queue']);

  // Parent OWNER/ADMIN sees fixtures (they can edit them); a plain season member does not.
  assert.deepEqual(await ids('bk-league', booker), ['g-fixture']);

  // Global admins bypass the filter entirely.
  assert.deepEqual(await ids('bk-shared', { userId: 'root', isAdmin: true }), ['g-mine', 'g-private']);
  assert.equal(seenWheres.at(-1)?.game, undefined);

  // Batch endpoint: same scoping, response keyed by every requested id (unchanged shape).
  const batch = await service.findLinkedGamesForBookings(
    [' bk-shared ', 'bk-league', 'bk-unknown', 'bk-shared'],
    booker,
  );
  assert.deepEqual(Object.keys(batch).sort(), ['bk-league', 'bk-shared', 'bk-unknown']);
  assert.deepEqual(batch['bk-shared'].map((g) => g.id), ['g-mine']);
  assert.deepEqual(batch['bk-league'].map((g) => g.id), ['g-fixture']);
  assert.deepEqual(batch['bk-unknown'], []);

  // Response rows keep the shipped shape.
  const [row] = await service.findLinkedGamesForBooking('bk-shared', booker);
  assert.deepEqual(Object.keys(row).sort(), [
    'endTime',
    'id',
    'linkBookingEnd',
    'linkBookingStart',
    'name',
    'startTime',
    'status',
    'timeIsSet',
  ]);

  // Every non-admin query carried the viewer filter.
  for (const where of seenWheres) {
    if (where.game) assert.ok(where.game.OR.length === 2);
  }
  assert.ok(seenWheres.filter((w) => w.game).length >= 7);

  console.log('ok: booktimeGameLink.service.test.ts');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
