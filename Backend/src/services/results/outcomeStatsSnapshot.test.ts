import assert from 'node:assert/strict';
import {
  clampSportProfileGameStats,
  computeApplySportStats,
  computeSportStatsDeltas,
  computeUndoSportStatsFromDeltas,
  computeUndoTotalPoints,
  mergeRatingStatsAppliedMetadata,
  mergeSportStatsDeltasMetadata,
  readRatingStatsAppliedFromMetadata,
  readSportStatsDeltasFromMetadata,
  resolveRatingStatsAppliedForUndo,
  resolveSportStatsDeltasForReconcile,
  resolveSportStatsDeltasForUndo,
  resolveGameLevelChangeEventLevels,
  shouldCreateGameLevelChangeEvent,
} from './outcomeStatsSnapshot';

const snap = () => ({
  level: 2.5,
  reliability: 10,
  gamesPlayed: 3,
  gamesWon: 2,
});

function simulateRecalculate(
  snapshot: ReturnType<typeof snap>,
  oldMetadata: object | null,
  oldIsWinner: boolean,
  newIsWinner: boolean,
  gameAffectsRating: boolean,
) {
  const undoDeltas = resolveSportStatsDeltasForUndo(oldMetadata, oldIsWinner, gameAffectsRating);
  const afterUndo = computeUndoSportStatsFromDeltas(snapshot, undoDeltas);
  const applyDeltas = computeSportStatsDeltas(gameAffectsRating, newIsWinner);
  return clampSportProfileGameStats(
    afterUndo.gamesPlayed + applyDeltas.gamesPlayedDelta,
    afterUndo.gamesWon + applyDeltas.gamesWonDelta,
  );
}

function simulateRecalculateCycles(
  snapshot: ReturnType<typeof snap>,
  metadata: object | null,
  isWinner: boolean,
  gameAffectsRating: boolean,
  cycles: number,
) {
  let gamesPlayed = snapshot.gamesPlayed;
  let gamesWon = snapshot.gamesWon;
  for (let i = 0; i < cycles; i++) {
    ({ gamesPlayed, gamesWon } = simulateRecalculate(
      { ...snapshot, gamesPlayed, gamesWon },
      metadata,
      isWinner,
      isWinner,
      gameAffectsRating,
    ));
  }
  return { gamesPlayed, gamesWon };
}

assert.equal(
  readRatingStatsAppliedFromMetadata(
    mergeRatingStatsAppliedMetadata({ wins: 1 }, true) as unknown as object,
  ),
  true,
);

assert.deepEqual(readSportStatsDeltasFromMetadata(mergeSportStatsDeltasMetadata(null, { gamesPlayedDelta: 1, gamesWonDelta: 0 }) as object), {
  gamesPlayedDelta: 1,
  gamesWonDelta: 0,
});

assert.equal(resolveRatingStatsAppliedForUndo(null, false), false);
assert.equal(resolveRatingStatsAppliedForUndo(mergeRatingStatsAppliedMetadata(null, true) as object, false), true);

assert.deepEqual(resolveSportStatsDeltasForUndo(null, true, false), { gamesPlayedDelta: 0, gamesWonDelta: 0 });
assert.deepEqual(
  resolveSportStatsDeltasForUndo(mergeRatingStatsAppliedMetadata(null, true) as object, true, false),
  { gamesPlayedDelta: 1, gamesWonDelta: 1 },
);
assert.deepEqual(
  resolveSportStatsDeltasForUndo(mergeRatingStatsAppliedMetadata(null, false) as object, true, true),
  { gamesPlayedDelta: 0, gamesWonDelta: 0 },
);

let gamesWon = 1;
for (let i = 0; i < 10; i++) {
  ({ gamesWon } = computeUndoSportStatsFromDeltas(
    { ...snap(), gamesWon },
    { gamesPlayedDelta: 1, gamesWonDelta: 1 },
  ));
}
assert.equal(gamesWon, 0);

const afterApply = computeApplySportStats(snap(), true, 2.7, 12, true);
assert.equal(afterApply.gamesPlayed, 4);
assert.equal(afterApply.gamesWon, 3);
assert.equal(afterApply.level, 2.7);

const nonRating = computeApplySportStats(snap(), false, 9, 12, true);
assert.equal(nonRating.level, 2.5);
assert.equal(nonRating.gamesPlayed, 3);
assert.equal(nonRating.gamesWon, 2);

assert.equal(computeUndoTotalPoints(5, 10, true), 0);
assert.equal(computeUndoTotalPoints(5, 10, false), 5);

assert.equal(clampSportProfileGameStats(5, 9).gamesWon, 5);
assert.equal(clampSportProfileGameStats(3, -2).gamesWon, 0);

const storedMetadata = mergeSportStatsDeltasMetadata(
  mergeRatingStatsAppliedMetadata(null, true),
  { gamesPlayedDelta: 1, gamesWonDelta: 1 },
) as object;

assert.deepEqual(simulateRecalculate(snap(), storedMetadata, true, true, true), {
  gamesPlayed: snap().gamesPlayed,
  gamesWon: snap().gamesWon,
});

assert.deepEqual(simulateRecalculateCycles(snap(), storedMetadata, true, true, 5), {
  gamesPlayed: snap().gamesPlayed,
  gamesWon: snap().gamesWon,
});

assert.deepEqual(simulateRecalculate(snap(), null, true, true, true), {
  gamesPlayed: snap().gamesPlayed,
  gamesWon: snap().gamesWon,
});

assert.deepEqual(simulateRecalculateCycles(snap(), null, true, true, 5), {
  gamesPlayed: snap().gamesPlayed,
  gamesWon: snap().gamesWon,
});

assert.deepEqual(
  simulateRecalculate(
    snap(),
    mergeRatingStatsAppliedMetadata(null, false) as object,
    true,
    true,
    true,
  ),
  { gamesPlayed: 4, gamesWon: 3 },
);

assert.deepEqual(simulateRecalculate(snap(), storedMetadata, true, false, true), {
  gamesPlayed: 3,
  gamesWon: 1,
});

const loserMetadata = mergeSportStatsDeltasMetadata(
  mergeRatingStatsAppliedMetadata(null, true),
  { gamesPlayedDelta: 1, gamesWonDelta: 0 },
) as object;

assert.deepEqual(simulateRecalculate(snap(), loserMetadata, false, true, true), {
  gamesPlayed: 3,
  gamesWon: 3,
});

assert.deepEqual(resolveSportStatsDeltasForReconcile(null, true, true), {
  gamesPlayedDelta: 1,
  gamesWonDelta: 1,
});

assert.equal(shouldCreateGameLevelChangeEvent(false, 0), true);
assert.equal(shouldCreateGameLevelChangeEvent(true, 0), false);
assert.equal(shouldCreateGameLevelChangeEvent(true, 0.01), true);

const flat = resolveGameLevelChangeEventLevels(false, 2.5, 2.7);
assert.equal(flat.levelBefore, 2.5);
assert.equal(flat.levelAfter, 2.5);

console.log('outcomeStatsSnapshot.test.ts: ok');
