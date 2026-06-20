import assert from 'node:assert/strict';
import { scoreLivePoint, createInitialLiveScoringState } from '../services/results/liveScoringEngine/core';
import { getRules } from '../services/results/liveScoringEngine/rulebook';
import {
  clearLetPending,
  expectedBadmintonCourtSide,
  isLetReplayBlockingScore,
  opponentTeam,
  validateStrictBadmintonServeBeforePoint,
  withLetPending,
} from './officiatingEnforcement';

function testBadmintonCourtSide(): void {
  assert.equal(expectedBadmintonCourtSide(0), 'rightDeuce');
  assert.equal(expectedBadmintonCourtSide(1), 'leftAd');
  assert.equal(expectedBadmintonCourtSide(10), 'rightDeuce');
}

function testLetBlocksStrictScore(): void {
  const rules = getRules({
    scoringPreset: 'BEST_OF_3_21',
    sport: 'BADMINTON',
    fixedNumberOfSets: 3,
    maxTotalPointsPerSet: 21,
    maxPointsPerTeam: 0,
    winnerOfMatch: 'BY_SETS',
    ballsInGames: false,
    deucesBeforeGoldenPoint: null,
    pointsPerTie: 0,
    matchTimerEnabled: false,
    metadata: { officiatingLevel: 'strict' },
  });
  let state = withLetPending(createInitialLiveScoringState(rules));
  assert.equal(isLetReplayBlockingScore(state, 'strict'), true);
  const blocked = scoreLivePoint(state, 'teamA', rules);
  assert.equal(blocked.changed, false);
  state = clearLetPending(state);
  const ok = scoreLivePoint(state, 'teamA', rules);
  assert.equal(ok.changed, true);
}

function testServeSideValidation(): void {
  const ok = validateStrictBadmintonServeBeforePoint({
    level: 'strict',
    sport: 'BADMINTON',
    serverScore: 4,
    courtSide: 'rightDeuce',
  });
  assert.equal(ok.ok, true);
  const bad = validateStrictBadmintonServeBeforePoint({
    level: 'strict',
    sport: 'BADMINTON',
    serverScore: 3,
    courtSide: 'rightDeuce',
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'SERVE_SIDE_MISMATCH');
}

function testOpponentTeam(): void {
  assert.equal(opponentTeam('teamA'), 'teamB');
  assert.equal(opponentTeam('teamB'), 'teamA');
}

function main(): void {
  testBadmintonCourtSide();
  testLetBlocksStrictScore();
  testServeSideValidation();
  testOpponentTeam();
  console.log('officiatingEnforcement.test: passed');
}

main();
