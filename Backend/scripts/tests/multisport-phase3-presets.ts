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
  for (const key of ['POINTS_11', 'BEST_OF_3_11', 'BEST_OF_5_11', 'PAR_11', 'BEST_OF_3_21'] as const) {
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

  const bd = getRulesFromPreset('BEST_OF_3_21');
  assert(bd.fixedNumberOfSets === 3 && bd.minSetsToWin === 2, 'BEST_OF_3_21 structure');
  assert(bd.totalPointsPerSet === 21 && bd.winnerOfMatch === 'BY_SETS', 'BEST_OF_3_21 per-set');
  console.log('ok: rulebook rally preset rules');
}

function testFrontendJson(): void {
  const jsonPath = join(__dirname, '../../../Frontend/src/config/scoringPresets.json');
  const data = JSON.parse(readFileSync(jsonPath, 'utf8')) as Record<
    string,
    { maxTotalPointsPerSet: number; fixedNumberOfSets: number; winnerOfMatch: string }
  >;
  assert(data.POINTS_11?.maxTotalPointsPerSet === 11, 'JSON POINTS_11');
  assert(data.BEST_OF_3_11?.fixedNumberOfSets === 3, 'JSON BEST_OF_3_11 sets');
  assert(data.BEST_OF_5_11?.fixedNumberOfSets === 5, 'JSON BEST_OF_5_11 sets');
  assert(data.PAR_11?.maxTotalPointsPerSet === 11, 'JSON PAR_11');
  assert(data.BEST_OF_3_21?.fixedNumberOfSets === 3, 'JSON BEST_OF_3_21 sets');
  console.log('ok: scoringPresets.json phase-3 entries');
}

function main(): void {
  testGlobalPresetList();
  testRulebook();
  testFrontendJson();
  console.log('multisport-phase3-presets: all passed');
}

main();
