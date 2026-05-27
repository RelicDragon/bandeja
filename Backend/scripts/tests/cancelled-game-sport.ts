/**
 * Cancelled game sport projection — static QA for 410 payloads and persistence.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const backendRoot = join(__dirname, '..', '..');
const srcRoot = join(backendRoot, 'src');
const repoRoot = join(backendRoot, '..');

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function testSchemaAndMigration(): void {
  const schema = readFileSync(join(backendRoot, 'prisma/schema.prisma'), 'utf8');
  const modelMatch = schema.match(/model CancelledGame \{[\s\S]*?\n\}/);
  assert(modelMatch != null, 'CancelledGame model in schema');
  assert(/^\s+sport\s+Sport\s+@default\(PADEL\)/m.test(modelMatch![0]), 'CancelledGame.sport with PADEL default');

  const migrationDir = join(backendRoot, 'prisma/migrations');
  const migrationSql = readFileSync(
    join(migrationDir, '20260527224014_cancelled_game_sport/migration.sql'),
    'utf8',
  );
  assert(migrationSql.includes('CancelledGame'), 'cancelled_game_sport migration targets CancelledGame');
  assert(/sport/i.test(migrationSql), 'cancelled_game_sport migration adds sport column');
  console.log('ok: CancelledGame schema + migration');
}

function testDeleteServicePersistsSport(): void {
  const src = readFileSync(join(srcRoot, 'services/game/delete.service.ts'), 'utf8');
  assert(src.includes('cancelledGame.create'), 'delete persists CancelledGame row');
  assert(/sport:\s*game\.sport/.test(src) || /sport:\s*cancelledSport/.test(src), 'delete saves game sport');
  assert(src.includes('projectUserForSportContext'), 'delete projects cancelledByUser for sport');
  assert(src.includes('sport: cancelledSport'), 'delete meta includes sport');
  console.log('ok: delete.service cancelled sport persistence');
}

function testReadService410Payload(): void {
  const src = readFileSync(join(srcRoot, 'services/game/read.service.ts'), 'utf8');
  assert(src.includes('ApiError(410'), 'read throws 410 for cancelled games');
  assert(src.includes('sport: cancelledSport'), '410 payload includes sport');
  assert(src.includes('projectUserForSportContext(cancelledByUserRaw, cancelledSport)'), '410 projects cancelledByUser');
  console.log('ok: read.service 410 cancelled payload');
}

function testSocketServiceCancelledSport(): void {
  const src = readFileSync(join(srcRoot, 'services/socket.service.ts'), 'utf8');
  assert(src.includes('cancelled.sport'), 'socket reads cancelled sport');
  assert(src.includes('projectUserForSportContext'), 'socket projects cancelledByUser for sport');
  console.log('ok: socket.service cancelled sport');
}

function testFrontendCancelledUi(): void {
  const shell = readFileSync(join(repoRoot, 'Frontend/src/pages/GameDetailsShell.tsx'), 'utf8');
  const cancelled = readFileSync(join(repoRoot, 'Frontend/src/components/GameDetails/GameCancelled.tsx'), 'utf8');
  assert(shell.includes('sport') || shell.includes('levelSport'), 'GameDetailsShell handles cancelled sport');
  assert(cancelled.includes('sport'), 'GameCancelled page uses sport');
  console.log('ok: frontend cancelled game sport wiring (static)');
}

testSchemaAndMigration();
testDeleteServicePersistsSport();
testReadService410Payload();
testSocketServiceCancelledSport();
testFrontendCancelledUi();
console.log('cancelled-game-sport: all checks passed');
