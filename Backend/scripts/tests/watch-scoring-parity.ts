/**
 * Live scoring parity: shared golden fixture catalog (FE core + Watch engine).
 *
 * How to add a fixture: see `Frontend/src/utils/liveScoring/scoringGolden.harness.ts`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '../../..');
const feRules = join(repoRoot, 'Frontend/src/utils/liveScoring');
const goldenFixturePath = join(feRules, 'fixtures/scoringGolden.json');
const goldenHarnessPath = join(feRules, 'scoringGolden.harness.ts');
const goldenTestPath = join(feRules, 'scoringGolden.test.ts');
const watchGoldenSwift = join(repoRoot, 'Frontend/ios/App/BandejaWatchWatchTests/ScoringGoldenFixturesTests.swift');
const watchGoldenRunner = join(repoRoot, 'Frontend/ios/scripts/run-watch-scoring-golden-tests.sh');
const frontendRoot = join(repoRoot, 'Frontend');

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function validateGoldenCatalog(): void {
  assert(existsSync(goldenFixturePath), 'scoringGolden.json exists');
  assert(existsSync(goldenHarnessPath), 'scoringGolden.harness.ts exists');
  assert(existsSync(goldenTestPath), 'scoringGolden.test.ts exists');
  assert(existsSync(watchGoldenSwift), 'ScoringGoldenFixturesTests.swift exists');
  assert(existsSync(watchGoldenRunner), 'run-watch-scoring-golden-tests.sh exists');

  const fixtures = JSON.parse(readFileSync(goldenFixturePath, 'utf8')) as unknown[];
  assert(Array.isArray(fixtures) && fixtures.length >= 9, 'scoringGolden.json has >= 9 fixtures');

  const swiftGolden = readFileSync(watchGoldenSwift, 'utf8');
  assert(swiftGolden.includes('ScoringGoldenFixtures.loadCatalog'), 'Watch tests load shared catalog');

  for (const fixture of fixtures) {
    const row = fixture as Record<string, unknown>;
    assert(typeof row.name === 'string', 'fixture has name');
    assert(typeof row.sport === 'string', `fixture ${row.name} has sport`);
    assert(typeof row.preset === 'string', `fixture ${row.name} has preset`);
    assert(row.expected != null && typeof row.expected === 'object', `fixture ${row.name} has expected`);
  }
}

function runTypescriptGoldenFixtures(): void {
  const vitest = join(frontendRoot, 'node_modules', 'vitest', 'vitest.mjs');
  if (!existsSync(vitest)) {
    console.log('watch-scoring-parity: skipping Vitest (install Frontend deps to run locally)');
    return;
  }
  const r = spawnSync(
    process.execPath,
    [vitest, 'run', 'src/utils/liveScoring/scoringGolden.test.ts'],
    { cwd: frontendRoot, stdio: 'inherit', env: process.env },
  );
  if ((r.status ?? 1) !== 0) {
    console.error('FAIL: scoring golden Vitest');
    process.exit(r.status ?? 1);
  }
}

function runWatchGoldenFixtures(): void {
  if (process.platform !== 'darwin') {
    console.log('watch-scoring-parity: skipping xcodebuild (not macOS)');
    return;
  }
  const r = spawnSync('bash', [watchGoldenRunner], { cwd: frontendRoot, stdio: 'inherit', env: process.env });
  if ((r.status ?? 1) !== 0) {
    console.error('FAIL: Watch ScoringGoldenFixturesTests');
    process.exit(r.status ?? 1);
  }
}

function main(): void {
  validateGoldenCatalog();
  runTypescriptGoldenFixtures();
  runWatchGoldenFixtures();
  console.log('watch-scoring-parity: all passed');
}

main();
