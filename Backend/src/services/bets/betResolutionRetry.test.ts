import assert from 'node:assert/strict';
import {
  attemptBetResolutionAfterOutcomesRecalc,
  reconcilePendingGameBets,
  setBetResolutionOrchestrationDeps,
} from './betResolution.service';

async function run() {
  let resolveCalls = 0;
  let hasPending = false;
  let notificationCount = 0;

  setBetResolutionOrchestrationDeps({
    gameHasPendingBetResolution: async () => hasPending,
    resolveGameBets: async () => {
      resolveCalls += 1;
      notificationCount += 1;
      if (resolveCalls === 1) {
        throw new Error('transient DB error');
      }
    },
  });

  try {
    // recalculateGameOutcomes: first finalize (shouldResolveBets=true) fails
    hasPending = false;
    await attemptBetResolutionAfterOutcomesRecalc('game-retry', true);
    assert.equal(resolveCalls, 1, 'first finalize always attempts resolution');
    assert.equal(notificationCount, 1, 'failed attempt still counts as one resolution try');

    // recalculateGameOutcomes on already-FINAL game with stuck OPEN/ACCEPTED bets
    hasPending = true;
    await attemptBetResolutionAfterOutcomesRecalc('game-retry', false);
    assert.equal(resolveCalls, 2, 'retry runs when FINAL game still has pending bets');
    assert.equal(notificationCount, 2, 'successful retry runs resolution once');

    // happy-path recalc after all bets resolved — no duplicate side effects
    hasPending = false;
    await attemptBetResolutionAfterOutcomesRecalc('game-retry', false);
    assert.equal(resolveCalls, 2, 'skip when no finalize and no pending bets');
    assert.equal(notificationCount, 2, 'no extra resolution side effects on happy path');

    // explicit reconcile entry point
    hasPending = true;
    await reconcilePendingGameBets('game-retry');
    assert.equal(resolveCalls, 3, 'reconcilePendingGameBets triggers retry path');

    hasPending = false;
    await attemptBetResolutionAfterOutcomesRecalc('game-retry', true);
    assert.equal(resolveCalls, 4, 'subsequent finalize path still attempts resolution');

    console.log('ok: bet resolution retry orchestration');
  } finally {
    setBetResolutionOrchestrationDeps(null);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
