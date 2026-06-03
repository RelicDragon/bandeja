import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCORING_PRESETS } from '../../src/utils/validators/gameFormat';
import { getRulesFromPreset } from '../../src/services/results/liveScoringEngine/rulebook';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function testGlobalPresetList(): void {
  for (const key of [
    'POINTS_11',
    'POINTS_12',
    'POINTS_15',
    'BEST_OF_3_11',
    'BEST_OF_3_15',
    'BEST_OF_5_11',
    'PAR_11',
    'SINGLE_GAME_21',
    'BEST_OF_3_21',
    'CLASSIC_FAST4',
  ] as const) {
    assert(SCORING_PRESETS.includes(key), `SCORING_PRESETS includes ${key}`);
  }
  console.log('ok: backend SCORING_PRESETS includes phase-3 rally presets');
}

function testRulebook(): void {
  const p11 = getRulesFromPreset('POINTS_11');
  assert(p11.totalPointsPerSet === 11 && p11.winBy === 2, 'POINTS_11 → 11 pts, win by 2');
  assert(p11.winnerOfMatch === 'BY_SCORES', 'POINTS_11 single-game');

  const bo3 = getRulesFromPreset('BEST_OF_3_11');
  assert(bo3.fixedNumberOfSets === 3 && bo3.minSetsToWin === 2, 'BEST_OF_3_11 structure');
  assert(bo3.totalPointsPerSet === 11 && bo3.winnerOfMatch === 'BY_SETS', 'BEST_OF_3_11 per-set');

  const bo5 = getRulesFromPreset('BEST_OF_5_11');
  assert(bo5.fixedNumberOfSets === 5 && bo5.minSetsToWin === 3, 'BEST_OF_5_11 structure');

  const par = getRulesFromPreset('PAR_11');
  assert(par.totalPointsPerSet === 11 && par.winBy === 2, 'PAR_11 squash PAR');

  const sg21 = getRulesFromPreset('SINGLE_GAME_21');
  assert(sg21.totalPointsPerSet === 21 && sg21.winBy === 2, 'SINGLE_GAME_21 → 21 pts, win by 2');
  assert(sg21.winnerOfMatch === 'BY_SCORES', 'SINGLE_GAME_21 single-game');

  const bd = getRulesFromPreset('BEST_OF_3_21');
  assert(bd.fixedNumberOfSets === 3 && bd.minSetsToWin === 2, 'BEST_OF_3_21 structure');
  assert(bd.totalPointsPerSet === 21 && bd.winnerOfMatch === 'BY_SETS', 'BEST_OF_3_21 per-set');

  const bo15 = getRulesFromPreset('BEST_OF_3_15');
  assert(bo15.fixedNumberOfSets === 3 && bo15.totalPointsPerSet === 15, 'BEST_OF_3_15 rally');

  const p15 = getRulesFromPreset('POINTS_15');
  assert(p15.totalPointsPerSet === 15 && p15.winBy === 0, 'POINTS_15 ball budget');

  const p12 = getRulesFromPreset('POINTS_12');
  assert(p12.totalPointsPerSet === 12 && p12.winnerOfMatch === 'BY_SCORES', 'POINTS_12');

  const fast4 = getRulesFromPreset('CLASSIC_FAST4');
  assert(fast4.gamesPerSet === 4 && fast4.tieBreakGameFirstTo === 5, 'CLASSIC_FAST4 TB to 5');
  console.log('ok: rulebook rally preset rules');
}

function testFrontendJson(): void {
  const jsonPath = join(__dirname, '../../../Frontend/src/config/scoringPresets.json');
  const data = JSON.parse(readFileSync(jsonPath, 'utf8')) as Record<
    string,
    {
      maxTotalPointsPerSet: number;
      fixedNumberOfSets: number;
      winnerOfMatch: string;
      ballsInGames?: boolean;
    }
  >;
  assert(data.POINTS_11?.maxTotalPointsPerSet === 11, 'JSON POINTS_11');
  assert(data.BEST_OF_3_11?.fixedNumberOfSets === 3, 'JSON BEST_OF_3_11 sets');
  assert(data.BEST_OF_5_11?.fixedNumberOfSets === 5, 'JSON BEST_OF_5_11 sets');
  assert(data.PAR_11?.maxTotalPointsPerSet === 11, 'JSON PAR_11');
  assert(data.SINGLE_GAME_21?.maxTotalPointsPerSet === 21, 'JSON SINGLE_GAME_21');
  assert(data.BEST_OF_3_21?.fixedNumberOfSets === 3, 'JSON BEST_OF_3_21 sets');
  assert(data.BEST_OF_3_15?.maxTotalPointsPerSet === 15, 'JSON BEST_OF_3_15');
  assert(data.POINTS_15?.maxTotalPointsPerSet === 15, 'JSON POINTS_15');
  assert(data.POINTS_12?.maxTotalPointsPerSet === 12, 'JSON POINTS_12');
  assert(data.CLASSIC_FAST4?.ballsInGames === true, 'JSON CLASSIC_FAST4');
  console.log('ok: scoringPresets.json phase-3 entries');
}

function main(): void {
  testGlobalPresetList();
  testRulebook();
  testFrontendJson();
  console.log('multisport-phase3-presets: all passed');
}

main();
