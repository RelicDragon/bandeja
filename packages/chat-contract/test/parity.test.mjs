import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { CHAT_SYNC_EVENT_TYPES } = require('../dist/index.js');

const __dirname = dirname(fileURLToPath(import.meta.url));

function prismaChatSyncEventTypes() {
  const schemaPath = join(__dirname, '../../../Backend/prisma/schema.prisma');
  const schema = readFileSync(schemaPath, 'utf8');
  const block = schema.match(/enum ChatSyncEventType \{([^}]+)\}/);
  if (!block) {
    throw new Error('ChatSyncEventType enum not found in schema.prisma');
  }
  return block[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

test('ChatSyncEventType values match Prisma schema', () => {
  const prismaValues = prismaChatSyncEventTypes();
  const packageValues = [...CHAT_SYNC_EVENT_TYPES].sort();
  const sortedPrisma = [...prismaValues].sort();
  assert.deepEqual(packageValues, sortedPrisma);
});
