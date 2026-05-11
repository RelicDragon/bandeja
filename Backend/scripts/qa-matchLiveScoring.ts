/**
 * QA: match live scoring (PATCH + revision + idempotency + updateMatch reconcile vs live).
 * Run: DB_URL=... npx ts-node scripts/qa-matchLiveScoring.ts
 */
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { EntityType, ParticipantRole } from '@prisma/client';
import { ApiError } from '../src/utils/ApiError';
import { patchMatchLiveScoring, notifyMatchLiveScoringCleared } from '../src/services/results/matchLiveScoring.service';
import { updateMatch, createRound, createMatch } from '../src/services/results.service';

function ensureDbUrl() {
  let url = process.env.DB_URL;
  if (!url) {
    throw new Error('Set DB_URL (e.g. postgresql://user:pass@host:5432/db?schema=padelpulse)');
  }
  if (!/[?&]schema=/.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'schema=padelpulse';
    process.env.DB_URL = url;
  }
}

type EmitPayload = { gameId: string; matchId: string; liveScoring: unknown };

function installSocketSpy(emitted: EmitPayload[]) {
  (globalThis as typeof globalThis & { socketService?: { emitMatchLiveScoringUpdated: (g: string, m: string, l: unknown) => void } }).socketService = {
    emitMatchLiveScoringUpdated(gameId: string, matchId: string, liveScoring: unknown) {
      emitted.push({ gameId, matchId, liveScoring });
    },
  };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function expectApiError(p: Promise<unknown>, status: number): Promise<void> {
  try {
    await p;
    throw new Error(`expected ApiError ${status}, succeeded`);
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.statusCode !== status) {
        throw new Error(`expected status ${status}, got ${e.statusCode}: ${e.message}`);
      }
      return;
    }
    throw e;
  }
}

async function main() {
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
  ensureDbUrl();
  const { default: prisma } = await import('../src/config/database');

  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) throw new Error('no City row');

  const users = await prisma.user.findMany({ take: 4, select: { id: true } });
  if (users.length < 4) throw new Error('need at least 4 User rows');
  const [u1, u2, u3, u4] = users.map((u) => u.id);

  const suffix = `${Date.now()}`;
  const gameId = `qa-mls-g-${suffix}`;
  const roundId = `qa-mls-r-${suffix}`;
  const matchId = `qa-mls-m-${suffix}`;

  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 7_200_000);

  const emitted: EmitPayload[] = [];
  installSocketSpy(emitted);

  await prisma.game.create({
    data: {
      id: gameId,
      entityType: EntityType.GAME,
      gameType: 'CLASSIC',
      cityId: city.id,
      startTime: start,
      endTime: end,
      maxParticipants: 4,
      minParticipants: 2,
      hasFixedTeams: false,
      timeIsSet: true,
      resultsByAnyone: false,
      ballsInGames: false,
      fixedNumberOfSets: 1,
      winnerOfMatch: 'BY_SCORES',
      participants: {
        create: [
          { userId: u1, role: ParticipantRole.OWNER },
          { userId: u2, role: ParticipantRole.PARTICIPANT },
          { userId: u3, role: ParticipantRole.PARTICIPANT },
          { userId: u4, role: ParticipantRole.PARTICIPANT },
        ],
      },
    },
  });

  try {
    await createRound(gameId, roundId);
    await createMatch(gameId, roundId, matchId);
    const seedTable = await updateMatch(gameId, matchId, {
      teamA: [u1, u2],
      teamB: [u3, u4],
      sets: [{ teamA: 0, teamB: 0 }],
    });
    assert(seedTable.liveScoringCleared === false, 'no live envelope -> cleared flag false');

    await expectApiError(
      patchMatchLiveScoring(gameId, matchId, u2, false, {
        state: { note: 'x' },
        baseRevision: null,
        clientMessageId: 'non-owner',
      }),
      403,
    );
    console.log('ok: non-owner without resultsByAnyone -> 403');

    const r1 = await patchMatchLiveScoring(gameId, matchId, u1, false, {
      state: { note: 'first' },
      baseRevision: null,
      clientMessageId: 'c1',
    });
    assert(r1.liveScoring?.revision === 1, `expected revision 1, got ${r1.revision}`);
    assert((r1.liveScoring?.state as { note?: string })?.note === 'first', 'state.note first');
    console.log('ok: first PATCH -> revision 1');

    const lastEmit = emitted[emitted.length - 1];
    assert(lastEmit.gameId === gameId && lastEmit.matchId === matchId, 'socket emit game/match');
    assert(
      (lastEmit.liveScoring as { revision?: number })?.revision === 1,
      'socket payload revision 1',
    );
    console.log('ok: socket emit after PATCH');

    await expectApiError(
      patchMatchLiveScoring(gameId, matchId, u1, false, {
        state: { note: 'bad' },
        baseRevision: 0,
        clientMessageId: 'bad-rev',
      }),
      409,
    );
    console.log('ok: stale baseRevision -> 409');

    const r2 = await patchMatchLiveScoring(gameId, matchId, u1, false, {
      state: { note: 'second' },
      baseRevision: 1,
      clientMessageId: 'c2',
    });
    assert(r2.revision === 2, `expected revision 2, got ${r2.revision}`);
    console.log('ok: second PATCH -> revision 2');

    const idem = await patchMatchLiveScoring(gameId, matchId, u1, false, {
      state: { note: 'should-not-apply' },
      baseRevision: 1,
      clientMessageId: 'c2',
    });
    assert(idem.revision === 2, 'idempotent replay keeps revision 2');
    assert((idem.liveScoring?.state as { note?: string })?.note === 'second', 'idempotent keeps prior state');
    console.log('ok: same clientMessageId -> idempotent');

    const syncLive = await patchMatchLiveScoring(gameId, matchId, u1, false, {
      state: { sets: [{ teamA: 0, teamB: 0, isTieBreak: false }] },
      baseRevision: 2,
      clientMessageId: 'sync-sets',
    });
    assert(syncLive.revision === 3, `sync sets expect revision 3, got ${syncLive.revision}`);
    console.log('ok: PATCH with sets grid aligned to table');

    const reconcilePreserve = await updateMatch(gameId, matchId, {
      teamA: [u1, u2],
      teamB: [u3, u4],
      sets: [{ teamA: 0, teamB: 0 }],
    });
    assert(reconcilePreserve.liveScoringCleared === false, 'compatible updateMatch preserves live');
    const rowPreserved = await prisma.match.findUnique({
      where: { id: matchId },
      select: { metadata: true },
    });
    assert(
      ((rowPreserved?.metadata as Record<string, unknown> | null)?.liveScoring as { revision?: number })
        ?.revision === 3,
      'liveScoring metadata still present after compatible updateMatch',
    );
    console.log('ok: updateMatch preserves live when sets+rosters match live grid');

    const rowBeforeTable = await prisma.match.findUnique({
      where: { id: matchId },
      select: { metadata: true },
    });
    assert(
      (rowBeforeTable?.metadata as Record<string, unknown> | null)?.liveScoring != null,
      'liveScoring present before incompatible updateMatch',
    );

    const reconcileClear = await updateMatch(gameId, matchId, {
      teamA: [u1, u2],
      teamB: [u3, u4],
      sets: [{ teamA: 1, teamB: 0 }],
    });
    assert(reconcileClear.liveScoringCleared === true, 'incompatible updateMatch clears live flag');

    const rowAfter = await prisma.match.findUnique({
      where: { id: matchId },
      select: { metadata: true },
    });
    const meta = rowAfter?.metadata as Record<string, unknown> | null | undefined;
    assert(!meta?.liveScoring, 'liveScoring cleared after incompatible updateMatch');
    console.log('ok: updateMatch clears liveScoring when table grid diverges');

    const emitCountBeforeClear = emitted.length;
    notifyMatchLiveScoringCleared(gameId, matchId);
    assert(emitted.length === emitCountBeforeClear + 1, 'notify emitted');
    assert(emitted[emitted.length - 1].liveScoring === null, 'clear emit null');
    console.log('ok: notifyMatchLiveScoringCleared emits null');

    await expectApiError(
      patchMatchLiveScoring(gameId, matchId, u1, false, {
        state: { note: 'after-clear' },
        baseRevision: 2,
        clientMessageId: 'after-clear',
      }),
      409,
    );
    console.log('ok: PATCH after clear with stale baseRevision -> 409');

    const r3 = await patchMatchLiveScoring(gameId, matchId, u1, false, {
      state: { note: 'fresh' },
      baseRevision: null,
      clientMessageId: 'fresh',
    });
    assert(r3.revision === 1, `after clear expect revision 1, got ${r3.revision}`);
    console.log('ok: PATCH after clear with baseRevision null -> revision 1');

    console.log('\nqa-matchLiveScoring: all checks passed.');
  } finally {
    delete (globalThis as { socketService?: unknown }).socketService;
    await prisma.game.delete({ where: { id: gameId } }).catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
