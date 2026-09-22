import assert from 'node:assert/strict';
import prisma from '../../src/config/database';
import { patchMatchLiveScoring } from '../../src/services/results/matchLiveScoring.service';
import { ApiError } from '../../src/utils/ApiError';
import { getGameResults, updateMatch, syncResults } from '../../src/services/results.service';
import { matchResultsVersion } from '../../src/services/results/resultsConcurrency';

async function main() {
  const url = new URL(process.env.DB_URL!);
  assert(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/padelpulse_dev', 'Local development database required');
  const city = await prisma.city.findFirstOrThrow({ select: { id: true } });
  const owner = await prisma.user.findFirstOrThrow({ select: { id: true } });
  const id = `qa-score-race-${Date.now()}`;
  await prisma.game.create({ data: {
    id, cityId: city.id, entityType: 'GAME', gameType: 'AMERICANO',
    startTime: new Date(), endTime: new Date(Date.now() + 3600000),
    maxParticipants: 4, minParticipants: 2, resultsStatus: 'IN_PROGRESS',
    participants: { create: { userId: owner.id, role: 'OWNER', status: 'PLAYING' } },
    rounds: { create: { id: `${id}-r`, roundNumber: 1, matches: { create: { id: `${id}-m`, matchNumber: 1, teams: { create: [{ teamNumber: 1 }, { teamNumber: 2 }] } } } } },
  } });
  try {
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => patchMatchLiveScoring(
      id, `${id}-m`, owner.id, false,
      { baseRevision: 0, opId: `device-${i}`, state: { note: `device-${i}` } },
    )));
    const accepted = outcomes.filter((r) => r.status === 'fulfilled');
    assert.equal(accepted.length, 1, 'Exactly one concurrent writer may advance the same base revision');
    for (const result of outcomes) {
      if (result.status === 'rejected') {
        assert(result.reason instanceof ApiError && result.reason.statusCode === 409);
      }
    }
    console.log('PASS: competing devices cannot both commit the same live revision');

    const read = () => prisma.match.findUniqueOrThrow({ where: { id: `${id}-m` }, include: { sets: true, teams: { include: { players: true } } } });
    const beforeCorrection = await read();
    const oldBoard = await getGameResults(id);
    const corrected = await updateMatch(id, `${id}-m`, { teamA: [], teamB: [], sets: [{ teamA: 12, teamB: 9 }], baseVersion: matchResultsVersion(beforeCorrection) });
    assert(corrected.liveScoringCleared);
    await assert.rejects(patchMatchLiveScoring(id, `${id}-m`, owner.id, false, { baseRevision: 1, state: { note: 'stale-live' }, opId: 'stale-live' }), (e: unknown) => e instanceof ApiError && e.statusCode === 409);
    assert.equal((await read()).sets[0].teamAScore, 12);
    console.log('PASS: manual correction survives delayed live scoring');

    await assert.rejects(syncResults(id, [{ id: `${id}-r`, matches: [{ id: `${id}-m`, teamA: [], teamB: [], sets: [{ teamA: 1, teamB: 0 }] }] }], oldBoard.resultsVersion as string), (e: unknown) => e instanceof ApiError && e.statusCode === 409);
    assert.equal((await read()).sets[0].teamAScore, 12);
    console.log('PASS: old offline snapshot cannot overwrite newer saved scores');

    const current = await read();
    const competing = await Promise.allSettled([13, 14].map(score => updateMatch(id, `${id}-m`, { teamA: [], teamB: [], sets: [{ teamA: score, teamB: 9 }], baseVersion: matchResultsVersion(current) })));
    assert.equal(competing.filter(r => r.status === 'fulfilled').length, 1);
    const latest = await read();
    const meta = latest.metadata as { liveScoring: { revision: number; state: unknown } };
    assert(meta.liveScoring.revision > 1 && meta.liveScoring.state === null);
    console.log('PASS: manual sessions use the same atomic conflict rule and retain revision tombstones');

    const board = await getGameResults(id);
    const snapshot = [{ id: `${id}-r`, matches: [{ id: `${id}-m`, teamA: [], teamB: [], sets: latest.sets.map(s => ({ teamA: s.teamAScore, teamB: s.teamBScore, role: s.role })) }] }];
    await syncResults(id, snapshot, board.resultsVersion as string);
    assert.deepEqual((await read()).teams.map(t => t.id).sort(), latest.teams.map(t => t.id).sort());
    assert.deepEqual((await read()).metadata, latest.metadata);
    console.log('PASS: safe sync preserves existing teams and score revisions');

    await prisma.game.update({ where: { id }, data: { resultsStatus: 'FINAL' } });
    await assert.rejects(patchMatchLiveScoring(id, `${id}-m`, owner.id, false, { baseRevision: meta.liveScoring.revision, state: { note: 'after-final' } }), (e: unknown) => e instanceof ApiError && e.statusCode === 409);
    console.log('PASS: delayed live request cannot mutate finalized results');
  } finally {
    await prisma.game.delete({ where: { id } });
    await prisma.$disconnect();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
