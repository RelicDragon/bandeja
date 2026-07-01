import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const deployScript = readFileSync(join(root, 'scripts/deploy-frontend.sh'), 'utf8');
const updScript = readFileSync(join(root, 'upd.sh'), 'utf8');

assert.match(
  deployScript,
  /rsync -a "\$UNREAD_CONTRACT\/" "\$WORKDIR\/packages\/unread-contract\/"/,
  'deploy-frontend.sh must copy packages/unread-contract into the isolated build workdir'
);

assert.match(
  updScript,
  /packages\/unread-contract\/\*/,
  'upd.sh must treat packages/unread-contract changes as deployable'
);
