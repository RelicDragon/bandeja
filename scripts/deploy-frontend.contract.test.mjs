import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const deployScript = readFileSync(join(root, 'scripts/deploy-frontend.sh'), 'utf8');
const backendDeployScript = readFileSync(join(root, 'scripts/deploy-backend.sh'), 'utf8');
const updScript = readFileSync(join(root, 'upd.sh'), 'utf8');

assert.match(
  deployScript,
  /rsync -a "\$UNREAD_CONTRACT\/" "\$WORKDIR\/packages\/unread-contract\/"/,
  'deploy-frontend.sh must copy packages/unread-contract into the isolated build workdir'
);

assert.match(
  deployScript,
  /rsync -a "\$APP_LOCALE\/" "\$WORKDIR\/packages\/app-locale\/"/,
  'deploy-frontend.sh must copy packages/app-locale into the isolated build workdir'
);

assert.match(
  deployScript,
  /install -m 755 "\$RUN_HEAVY" "\$WORKDIR\/scripts\/run-heavy"/,
  'deploy-frontend.sh must copy scripts/run-heavy into the isolated build workdir'
);

assert.match(
  updScript,
  /packages\/unread-contract\/\*/,
  'upd.sh must treat packages/unread-contract changes as deployable'
);

assert.match(
  updScript,
  /packages\/app-locale\/\*/,
  'upd.sh must treat packages/app-locale changes as deployable'
);

const prebuildIdx = backendDeployScript.indexOf('npm run prebuild');
const seedIdx = backendDeployScript.indexOf('npm run seed:sticker-packs');
assert.ok(prebuildIdx >= 0, 'deploy-backend.sh must build workspace packages');
assert.ok(seedIdx >= 0, 'deploy-backend.sh must seed sticker packs');
assert.ok(
  prebuildIdx < seedIdx,
  'deploy-backend.sh must build @bandeja/app-locale before seed:sticker-packs'
);
