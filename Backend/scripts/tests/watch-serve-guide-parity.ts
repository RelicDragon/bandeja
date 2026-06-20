/**
 * Serve guide parity: static Watch/FE checks + shared golden fixture catalog.
 *
 * How to add a fixture: see `Frontend/src/utils/liveScoring/serveGuideGolden.harness.ts`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '../../..');
const watchRoot = join(repoRoot, 'Frontend/ios/App/BandejaWatch Watch App');
const feRules = join(repoRoot, 'Frontend/src/utils/liveScoring');
const goldenFixturePath = join(feRules, 'fixtures/serveGuideGolden.json');
const goldenHarnessPath = join(feRules, 'serveGuideGolden.harness.ts');
const goldenTestPath = join(feRules, 'serveGuideGolden.test.ts');
const watchGoldenSwift = join(
  repoRoot,
  'Frontend/ios/App/BandejaWatchWatchTests/ServeGuideGoldenFixturesTests.swift',
);
const watchGoldenRunner = join(repoRoot, 'Frontend/ios/scripts/run-watch-serve-guide-golden-tests.sh');
const frontendRoot = join(repoRoot, 'Frontend');

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function read(rel: string): string {
  return readFileSync(join(watchRoot, rel), 'utf8');
}

function validateGoldenCatalog(): void {
  assert(existsSync(goldenFixturePath), 'serveGuideGolden.json exists');
  assert(existsSync(goldenHarnessPath), 'serveGuideGolden.harness.ts exists');
  assert(existsSync(goldenTestPath), 'serveGuideGolden.test.ts exists');
  assert(existsSync(watchGoldenSwift), 'ServeGuideGoldenFixturesTests.swift exists');
  assert(existsSync(watchGoldenRunner), 'run-watch-serve-guide-golden-tests.sh exists');

  const fixtures = JSON.parse(readFileSync(goldenFixturePath, 'utf8')) as unknown[];
  assert(Array.isArray(fixtures) && fixtures.length >= 19, 'serveGuideGolden.json has >= 19 fixtures');

  const swiftGolden = readFileSync(watchGoldenSwift, 'utf8');
  assert(swiftGolden.includes('ServeGuideGoldenFixtures.loadCatalog'), 'Watch tests load shared catalog');

  for (const fixture of fixtures) {
    const row = fixture as Record<string, unknown>;
    assert(typeof row.name === 'string', 'fixture has name');
    assert(typeof row.sport === 'string', `fixture ${row.name} has sport`);
    assert(typeof row.preset === 'string', `fixture ${row.name} has preset`);
    if (row.expectNull !== true) {
      assert(row.expected != null && typeof row.expected === 'object', `fixture ${row.name} has expected`);
    }
  }
}

function runTypescriptGoldenFixtures(): void {
  const vitest = join(frontendRoot, 'node_modules', 'vitest', 'vitest.mjs');
  if (!existsSync(vitest)) {
    console.log('watch-serve-guide-parity: skipping Vitest (install Frontend deps to run locally)');
    return;
  }
  const r = spawnSync(
    process.execPath,
    [vitest, 'run', 'src/utils/liveScoring/serveGuideGolden.test.ts'],
    { cwd: frontendRoot, stdio: 'inherit', env: process.env },
  );
  if ((r.status ?? 1) !== 0) {
    console.error('FAIL: serve guide golden Vitest');
    process.exit(r.status ?? 1);
  }
}

function runWatchGoldenFixtures(): void {
  if (process.platform !== 'darwin') {
    console.log('watch-serve-guide-parity: skipping xcodebuild (not macOS)');
    return;
  }
  const r = spawnSync('bash', [watchGoldenRunner], { cwd: frontendRoot, stdio: 'inherit', env: process.env });
  if ((r.status ?? 1) !== 0) {
    console.error('FAIL: Watch ServeGuideGoldenFixturesTests');
    process.exit(r.status ?? 1);
  }
}

function staticWatchFeChecks(): void {
  const engine = read('Services/ServeGuideEngine.swift');
  const rules = read('Services/ServeGuideSportRules.swift');
  assert(engine.includes('finalizeSnapshot'), 'tennis motion token finalize');
  assert(engine.includes('resolvedSport'), 'resolved sport on inputs');
  assert(!engine.includes('hiddenForMatch'), 'engine does not use hiddenForMatch');

  assert(rules.includes('squashChangeEnds'), 'squash PAR change ends');
  assert(rules.includes('pickleballChangeEnds'), 'pickleball interval change ends');
  assert(rules.includes('pickleballMidpointScore'), 'pickleball midpoint helper');

  const store = read('Services/WatchServeGuideSessionStore.swift');
  assert(store.includes('hiddenForMatch'), 'decode migrates legacy hiddenForMatch');
  assert(!store.includes('hiddenForMatch: false'), 'empty record without hiddenForMatch field');

  const fePb = readFileSync(join(feRules, 'pickleballServe.ts'), 'utf8');
  const feSq = readFileSync(join(feRules, 'squashServe.ts'), 'utf8');
  assert(fePb.includes('pickleballMidpointScore'), 'FE pickleball midpoint');
  assert(rules.includes('pickleballMidpointScore'), 'watch pickleball midpoint matches');
  assert(feSq.includes('max === 11 && min < 10'), 'FE squash change ends');
  assert(rules.includes('maxScore == 11 && minScore < 10'), 'watch squash change ends matches');
  assert(feSq.includes('squashCourtSideForServerScore'), 'FE squash court side');
  assert(rules.includes('squashCourtSide'), 'watch squash court side');
}

function main(): void {
  staticWatchFeChecks();
  validateGoldenCatalog();
  runTypescriptGoldenFixtures();
  runWatchGoldenFixtures();
  console.log('watch-serve-guide-parity: all passed');
}

main();
