import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  GAME_TEXT_AUTHORED_WRITERS,
  GAME_TEXT_GENERATED_WRITERS,
  GAME_TEXT_NAME_PROVENANCE_GENERATED_FIXTURE,
  gameTextMetadataWithNameProvenance,
} from './gameTextWriterAudit';

const repoRoot = path.join(__dirname, '..', '..', '..', '..');

function readRepo(rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function run() {
  assert.ok(GAME_TEXT_AUTHORED_WRITERS.length >= 3);
  assert.ok(GAME_TEXT_GENERATED_WRITERS.length >= 2);

  const createSrc = readRepo('Backend/src/services/game/create.service.ts');
  assert.match(createSrc, /applyGameTextSourceChangeInTransaction/);

  const updateSrc = readRepo('Backend/src/services/game/update.service.ts');
  assert.match(updateSrc, /applyGameTextSourceChangeInTransaction/);

  const leagueCreate = readRepo('Backend/src/services/league/create.service.ts');
  assert.match(leagueCreate, /applyGameTextSourceChangeInTransaction/);
  // Season game.create + helper (+ league) share one $transaction
  assert.match(
    leagueCreate,
    /\$transaction\(async \(tx\) => \{[\s\S]*tx\.game\.create\([\s\S]*applyGameTextSourceChangeInTransaction\(tx/,
  );

  const fixtures = readRepo('Backend/src/services/league/gameCreation.util.ts');
  assert.match(fixtures, /GAME_TEXT_NAME_PROVENANCE_GENERATED_FIXTURE/);
  assert.match(fixtures, /nameProvenance:\s*GAME_TEXT_NAME_PROVENANCE_GENERATED_FIXTURE/);
  assert.match(fixtures, /enqueueJobs:\s*false/);

  const meta = gameTextMetadataWithNameProvenance({ keep: 1 }, GAME_TEXT_NAME_PROVENANCE_GENERATED_FIXTURE);
  assert.equal(meta.keep, 1);
  assert.deepEqual(meta.gameText, { nameProvenance: 'generated_fixture' });

  console.log('gameTextWriterAudit.test.ts: ok');
  console.log('authored:', GAME_TEXT_AUTHORED_WRITERS.join(', '));
  console.log('generated:', GAME_TEXT_GENERATED_WRITERS.join(', '));
}

run();
