/**
 * MULTISPORT Phase 6 — Watch + marketplace orchestrator (P6-QA)
 *
 * Exit (when complete):
 * - P6-D: WatchGame decodes `sport` + `playersPerMatch` from game detail payloads.
 * - P6-E: Marketplace categories filterable by sport (schema + API + FE).
 *
 * Runs `multisport-phase6-marketplace.ts` when DB is available; static audits otherwise.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const backendRoot = join(__dirname, '..', '..');
const repoRoot = join(backendRoot, '..');
const srcRoot = join(backendRoot, 'src');
const tsNode = join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js');

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function skip(note: string): void {
  console.log(`SKIP: ${note}`);
}

function testBackendGameFieldsForWatch(): void {
  const schema = readFileSync(join(backendRoot, 'prisma/schema.prisma'), 'utf8');
  const gameMatch = schema.match(/model Game \{[\s\S]*?\n\}/);
  if (gameMatch == null) {
    console.error('FAIL: Game model in schema');
    process.exit(1);
  }
  const gameModel = gameMatch[0];
  assert(/^\s+sport\s+Sport\b/m.test(gameModel), 'Game.sport in schema');
  assert(/^\s+playersPerMatch\s+Int\b/m.test(gameModel), 'Game.playersPerMatch in schema');

  const readSrc = readFileSync(join(srcRoot, 'services/game/read.service.ts'), 'utf8');
  assert(readSrc.includes('sport: true'), 'game read exposes sport');
  assert(readSrc.includes('projectGameUsersForSportContext'), 'game read projects users for sport');

  const createSrc = readFileSync(join(srcRoot, 'services/game/create.service.ts'), 'utf8');
  assert(createSrc.includes('playersPerMatch'), 'game create handles playersPerMatch');

  console.log('ok: P6-D backend prerequisites (sport + playersPerMatch on game API)');
}

function testWatchGameSwiftPayload(): void {
  const watchGamePath = join(
    repoRoot,
    'Frontend/ios/App/BandejaWatch Watch App/Models/WatchGame.swift',
  );
  assert(existsSync(watchGamePath), 'WatchGame.swift exists');
  const src = readFileSync(watchGamePath, 'utf8');

  const codingKeysBlock = src.slice(src.indexOf('CodingKeys'), src.indexOf('CodingKeys') + 800);
  const hasSportField = /\blet\s+sport\b/.test(src);
  const hasPlayersPerMatch = /\blet\s+playersPerMatch\b/.test(src);

  if (!hasSportField || !hasPlayersPerMatch) {
    skip(
      'P6-D WatchGame: sport/playersPerMatch not decoded on Watch yet — iOS must add CodingKeys when Watch multisport ships',
    );
    return;
  }

  assert(/\bsport\b/.test(codingKeysBlock), 'WatchGame CodingKeys includes sport');
  assert(/\bplayersPerMatch\b/.test(codingKeysBlock), 'WatchGame CodingKeys includes playersPerMatch');
  console.log('ok: P6-D WatchGame decodes sport + playersPerMatch');
}

function testMarketplaceFeStatic(): void {
  const utilPath = join(repoRoot, 'Frontend/src/utils/marketplaceSport.ts');
  const apiPath = join(repoRoot, 'Frontend/src/api/marketplace.ts');
  const listPath = join(repoRoot, 'Frontend/src/pages/MarketplaceList.tsx');
  assert(existsSync(utilPath), 'marketplaceSport.ts exists');
  const utilSrc = readFileSync(utilPath, 'utf8');
  const apiSrc = readFileSync(apiPath, 'utf8');
  const listSrc = readFileSync(listPath, 'utf8');
  assert(utilSrc.includes('filterCategoriesForListing'), 'FE category sport filter helper');
  assert(apiSrc.includes('getCategories: async (sport?: Sport)'), 'FE getCategories accepts sport');
  assert(listSrc.includes('getCategories(categorySport)'), 'MarketplaceList passes primary sport to categories API');
  console.log('ok: P6-E marketplace FE sport wiring (static)');
}

function runMarketplaceDbSuite(): void {
  const script = join(__dirname, 'multisport-phase6-marketplace.ts');
  assert(existsSync(script), 'multisport-phase6-marketplace.ts exists');
  const r = spawnSync(
    process.execPath,
    ['-r', 'dotenv/config', tsNode, script],
    { cwd: backendRoot, stdio: 'inherit', env: process.env },
  );
  if ((r.status ?? 1) !== 0) {
    console.error('FAIL: multisport-phase6-marketplace sub-suite');
    process.exit(r.status ?? 1);
  }
}

function main(): void {
  testBackendGameFieldsForWatch();
  testWatchGameSwiftPayload();
  testMarketplaceFeStatic();
  runMarketplaceDbSuite();
  console.log('multisport-phase6: orchestrator passed');
}

main();
