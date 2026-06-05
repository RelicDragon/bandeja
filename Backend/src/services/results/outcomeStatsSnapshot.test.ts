import assert from 'node:assert/strict';
import {
  computeApplySportStats,
  computeUndoSportStats,
  computeUndoTotalPoints,
  mergeRatingStatsAppliedMetadata,
  readRatingStatsAppliedFromMetadata,
  resolveRatingStatsAppliedForUndo,
  resolveGameLevelChangeEventLevels,
  shouldCreateGameLevelChangeEvent,
} from './outcomeStatsSnapshot';

const snap = () => ({
  level: 2.5,
  reliability: 10,
  gamesPlayed: 3,
  gamesWon: 2,
});

assert.equal(
  readRatingStatsAppliedFromMetadata(
    mergeRatingStatsAppliedMetadata({ wins: 1 }, true) as unknown as object,
  ),
  true,
);

assert.equal(resolveRatingStatsAppliedForUndo(null, false), false);
assert.equal(resolveRatingStatsAppliedForUndo(mergeRatingStatsAppliedMetadata(null, true) as object, false), true);

let gamesWon = 1;
for (let i = 0; i < 10; i++) {
  ({ gamesWon } = computeUndoSportStats({ ...snap(), gamesWon }, true, true));
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

assert.equal(
  computeUndoSportStats(snap(), true, true).gamesWon,
  1,
);
assert.equal(
  computeUndoSportStats(snap(), false, true).gamesWon,
  2,
);

assert.equal(shouldCreateGameLevelChangeEvent(false, 0), true);
assert.equal(shouldCreateGameLevelChangeEvent(true, 0), false);
assert.equal(shouldCreateGameLevelChangeEvent(true, 0.01), true);

const flat = resolveGameLevelChangeEventLevels(false, 2.5, 2.7);
assert.equal(flat.levelBefore, 2.5);
assert.equal(flat.levelAfter, 2.5);

console.log('outcomeStatsSnapshot.test.ts: ok');
