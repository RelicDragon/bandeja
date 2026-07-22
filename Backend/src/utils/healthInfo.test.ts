import assert from 'node:assert/strict';
import { buildDetailedHealthPayload, buildPublicHealthPayload } from './healthInfo';

function run() {
  const pub = buildPublicHealthPayload();
  assert.equal(pub.status, 'ok');
  assert.ok(typeof pub.timestamp === 'string');
  assert.equal('database' in pub, false);
  assert.equal('runtime' in pub, false);

  const detailed = buildDetailedHealthPayload();
  assert.equal(detailed.status, 'ok');
  assert.ok(detailed.database?.name);
  assert.equal(typeof detailed.database.e2eSafe, 'boolean');
  assert.ok(detailed.runtime?.nodeEnv);

  console.log('healthInfo.test.ts: ok');
}

run();
