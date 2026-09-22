import assert from 'node:assert/strict';
import prisma from '../../src/config/database';
import { patchMatchLiveScoring } from '../../src/services/results/matchLiveScoring.service';
import { ApiError } from '../../src/utils/ApiError';
import { getGameResults, updateMatch, syncResults, patchMatchMetadata } from '../../src/services/results.service';
import { matchResultsVersion } from '../../src/services/results/resultsConcurrency';

async function main() {
  const url = new URL(process.env.DB_URL!);
  assert(['localhost', '127.0.0.1'].includes(url.hostname) && ['/padelpulse_dev', '/padelpulse_ci'].includes(url.pathname), 'Local development or CI database required');
  const id = `qa-score-race-${Date.now()}`;
  const city = await prisma.city.create({ data: { name: id, country: 'Test', timezone: 'UTC' } });
  const owner = await prisma.user.create({ data: { firstName: 'Scoring concurrency test' } });
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
    // A correction made after reading the winner is a new explicit edit and succeeds.
    const winner = await read();
    await updateMatch(id, `${id}-m`, { teamA: [], teamB: [], sets: [{ teamA: 15, teamB: 9 }], baseVersion: matchResultsVersion(winner) });
    const latest = await read();
    assert.equal(latest.sets[0].teamAScore, 15);
    const meta = latest.metadata as { liveScoring: { revision: number; state: unknown } };
    assert(meta.liveScoring.revision > 1 && meta.liveScoring.state === null);
    console.log('PASS: manual sessions use the same atomic conflict rule and retain revision tombstones');

    const board = await getGameResults(id);
    const snapshot = [{ id: `${id}-r`, matches: [{ id: `${id}-m`, teamA: [], teamB: [], sets: latest.sets.map(s => ({ teamA: s.teamAScore, teamB: s.teamBScore, role: s.role })) }] }];
    await syncResults(id, snapshot, board.resultsVersion as string);
    assert.deepEqual((await read()).teams.map(t => t.id).sort(), latest.teams.map(t => t.id).sort());
    assert.deepEqual((await read()).metadata, latest.metadata);
    console.log('PASS: safe sync preserves existing teams and score revisions');

    const second = await prisma.match.create({ data: { id: `${id}-m2`, roundId: `${id}-r`, matchNumber: 2, teams: { create: [{ teamNumber: 1 }, { teamNumber: 2 }] } }, include: { sets: true, teams: { include: { players: true } } } });
    await Promise.all([
      updateMatch(id, `${id}-m`, { teamA: [], teamB: [], sets: [{ teamA: 16, teamB: 9 }], baseVersion: matchResultsVersion(await read()) }),
      updateMatch(id, second.id, { teamA: [], teamB: [], sets: [{ teamA: 8, teamB: 7 }], baseVersion: matchResultsVersion(second) }),
    ]);
    assert.equal((await read()).sets[0].teamAScore, 16);
    assert.equal((await prisma.set.findFirstOrThrow({ where: { matchId: second.id } })).teamAScore, 8);
    console.log('PASS: independent courts can both save concurrently');

    const beforeFailedSync = await getGameResults(id);
    // Sync removes absent matches first; a later invalid score must roll all of it back.
    await assert.rejects(syncResults(id, [{ id: `${id}-r`, matches: [{ id: `${id}-m`, teamA: [], teamB: [], sets: [{ teamA: 1, teamB: 0, isTieBreak: true }] }] }], beforeFailedSync.resultsVersion as string));
    assert.equal((await read()).sets[0].teamAScore, 16);
    assert(await prisma.match.findUnique({ where: { id: second.id } }));
    assert.equal((await getGameResults(id)).resultsVersion, beforeFailedSync.resultsVersion);
    console.log('PASS: invalid snapshot rolls back all scores and deletions');

    const beforeMixed = await read();
    const mixedRevision = (beforeMixed.metadata as { liveScoring: { revision: number } }).liveScoring.revision;
    const mixed = await Promise.allSettled([
      updateMatch(id, `${id}-m`, { teamA: [], teamB: [], sets: [{ teamA: 17, teamB: 9 }], baseVersion: matchResultsVersion(beforeMixed) }),
      patchMatchLiveScoring(id, `${id}-m`, owner.id, false, { baseRevision: mixedRevision, opId: 'mixed-device', state: { note: 'mixed-device' } }),
    ]);
    assert.equal(mixed.filter(result => result.status === 'fulfilled').length, 1);
    for (const result of mixed) if (result.status === 'rejected') assert(result.reason instanceof ApiError && result.reason.statusCode === 409);
    console.log('PASS: manual and live scoring compete under the same atomic lock');
    const beforeStaleOutcome = await read();
    await assert.rejects(patchMatchMetadata(id, `${id}-m`, { nonRallyOutcome: 'WALKOVER' }, { baseVersion: matchResultsVersion(beforeMixed) }), (e: unknown) => e instanceof ApiError && e.statusCode === 409);
    assert.deepEqual((await read()).metadata, beforeStaleOutcome.metadata);
    console.log('PASS: delayed outcome edits cannot clear newer live scores');

    await prisma.game.update({ where: { id }, data: { resultsStatus: 'FINAL' } });
    await assert.rejects(updateMatch(id, `${id}-m`, { teamA: [], teamB: [], sets: [{ teamA: 18, teamB: 9 }], baseVersion: matchResultsVersion(await read()) }), (e: unknown) => e instanceof ApiError && e.statusCode === 409);
    await assert.rejects(patchMatchLiveScoring(id, `${id}-m`, owner.id, false, { baseRevision: meta.liveScoring.revision, state: { note: 'after-final' } }), (e: unknown) => e instanceof ApiError && e.statusCode === 409);
    console.log('PASS: delayed live request cannot mutate finalized results');
  } finally {
    await prisma.game.delete({ where: { id } });
    await prisma.user.delete({ where: { id: owner.id } });
    await prisma.city.delete({ where: { id: city.id } });
    await prisma.$disconnect();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
