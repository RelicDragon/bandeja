import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { GameStatus, ResultsStatus } from '@prisma/client';
import { createTestGame, ensureDbUrl, expectApiError } from '../../testHelpers';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

async function run() {
  if (!ensureDbUrl()) {
    console.log('skip: DB_URL not set');
    return;
  }

  const { default: prisma } = await import('../../config/database');
  const { patchMyWatchSession } = await import('./watchSession.service');
  const { createRound, createMatch } = await import('../results.service');
  const { recalculateGameOutcomes } = await import('../results/outcomes.service');

  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) throw new Error('no City row');

  const users = await prisma.user.findMany({
    where: { isActive: true },
    take: 3,
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (users.length < 3) throw new Error('need at least 3 active users');

  const [participant, coParticipant, outsider] = users;
  const suffix = Date.now();
  const scoringGameId = `qa-watch-session-scoring-${suffix}`;
  const otherGameId = `qa-watch-session-other-${suffix}`;
  const nonScoringGameId = `qa-watch-session-idle-${suffix}`;
  const roundId = `qa-watch-session-r-${suffix}`;
  const otherRoundId = `qa-watch-session-r2-${suffix}`;
  const matchId = `qa-watch-session-m-${suffix}`;
  const otherMatchId = `qa-watch-session-m2-${suffix}`;
  const gameIds = [scoringGameId, otherGameId, nonScoringGameId];

  await createTestGame(prisma, {
    gameId: scoringGameId,
    cityId: city.id,
    participantIds: [participant.id, coParticipant.id],
  });
  await createTestGame(prisma, {
    gameId: otherGameId,
    cityId: city.id,
    participantIds: [participant.id, coParticipant.id],
  });
  await createTestGame(prisma, {
    gameId: nonScoringGameId,
    cityId: city.id,
    participantIds: [participant.id, coParticipant.id],
  });

  try {
    await createRound(scoringGameId, roundId);
    await createMatch(scoringGameId, roundId, matchId);
    await createRound(otherGameId, otherRoundId);
    await createMatch(otherGameId, otherRoundId, otherMatchId);

    const scoringGame = await prisma.game.findUnique({
      where: { id: scoringGameId },
      select: { status: true, resultsStatus: true },
    });
    assert.equal(scoringGame?.status, GameStatus.STARTED);
    assert.equal(scoringGame?.resultsStatus, ResultsStatus.IN_PROGRESS);

    const updated = await patchMyWatchSession(scoringGameId, participant.id, matchId);
    assert.equal(updated.activeMatchId, matchId);

    const participantRow = await prisma.gameParticipant.findFirst({
      where: { gameId: scoringGameId, userId: participant.id },
      select: { activeMatchId: true },
    });
    assert.equal(participantRow?.activeMatchId, matchId);
    console.log('ok: patch activeMatchId to valid match');

    await expectApiError(
      () => patchMyWatchSession(nonScoringGameId, participant.id, matchId),
      400,
      'Game is not in scoring',
    );
    console.log('ok: reject when game is not in scoring');

    await expectApiError(
      () => patchMyWatchSession(scoringGameId, participant.id, otherMatchId),
      400,
      'Match not found for this game',
    );
    console.log('ok: reject when match does not belong to game');

    await expectApiError(
      () => patchMyWatchSession(scoringGameId, outsider.id, matchId),
      404,
      'Not a participant of this game',
    );
    console.log('ok: reject when user is not a participant');

    const idleParticipant = await prisma.gameParticipant.findFirst({
      where: { gameId: nonScoringGameId, userId: participant.id },
      select: { id: true },
    });
    assert.ok(idleParticipant);
    await prisma.gameParticipant.update({
      where: { id: idleParticipant.id },
      data: { activeMatchId: matchId },
    });

    const cleared = await patchMyWatchSession(nonScoringGameId, participant.id, null);
    assert.equal(cleared.activeMatchId, null);
    console.log('ok: clear activeMatchId without match validation');

    await patchMyWatchSession(scoringGameId, participant.id, matchId);
    await patchMyWatchSession(scoringGameId, coParticipant.id, matchId);
    await recalculateGameOutcomes(scoringGameId);

    const activeAfterRecalc = await prisma.gameParticipant.findMany({
      where: { gameId: scoringGameId },
      select: { userId: true, activeMatchId: true },
    });
    assert.equal(activeAfterRecalc.length, 2);
    for (const row of activeAfterRecalc) {
      assert.equal(row.activeMatchId, null, `expected null activeMatchId for ${row.userId}`);
    }
    console.log('ok: recalculateGameOutcomes clears activeMatchId');
  } finally {
    for (const gameId of gameIds) {
      await prisma.game.delete({ where: { id: gameId } }).catch(() => {});
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
