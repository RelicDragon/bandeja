import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const contract = require('../dist/index.js');

const __dirname = dirname(fileURLToPath(import.meta.url));

function fileContainsImport(relativePath, pkg) {
  const source = readFileSync(join(__dirname, relativePath), 'utf8');
  return source.includes(pkg);
}

function fileDefinesLocalComputeTotals(relativePath) {
  const source = readFileSync(join(__dirname, relativePath), 'utf8');
  return /export function computeTotals\s*\(/.test(source);
}

test('Frontend and Backend import computeTotals from @bandeja/unread-contract', () => {
  assert.equal(
    fileContainsImport('../../../Frontend/src/services/chat/unreadSnapshot.ts', '@bandeja/unread-contract'),
    true
  );
  assert.equal(
    fileContainsImport(
      '../../../Backend/src/services/chat/unreadSnapshot.service.ts',
      '@bandeja/unread-contract'
    ),
    true
  );
});

test('no duplicate local computeTotals implementations in FE/BE unread modules', () => {
  assert.equal(
    fileDefinesLocalComputeTotals('../../../Frontend/src/services/chat/unreadSnapshot.ts'),
    false
  );
  assert.equal(
    fileDefinesLocalComputeTotals('../../../Backend/src/services/chat/unreadSnapshot.service.ts'),
    false
  );
});

test('contract computeTotals matches Frontend fixture expectations', () => {
  const byContext = {
    [contract.contextKey('GAME', 'g1')]: 2,
    [contract.contextKey('USER', 'u1')]: 1,
    [contract.contextKey('GROUP', 'bug-ch')]: 3,
    [contract.contextKey('GROUP', 'social-ch')]: 4,
    [contract.contextKey('GROUP', 'channel-ch')]: 5,
    [contract.contextKey('GROUP', 'market-ch')]: 6,
  };
  const totals = contract.computeTotals(byContext, {
    groupChannelMeta: {
      'bug-ch': { bugId: 'b1', isChannel: true },
      'social-ch': { isChannel: false },
      'channel-ch': { isChannel: true, marketItemId: null },
      'market-ch': { marketItemId: 'm1', isChannel: true },
    },
    mutedGroupIds: new Set(),
  });
  assert.deepEqual(totals, {
    all: 21,
    games: 2,
    userChats: 1,
    bugs: 3,
    groups: 4,
    channels: 5,
    marketplace: 6,
    myGames: 0,
    pastGames: 0,
  });
});
