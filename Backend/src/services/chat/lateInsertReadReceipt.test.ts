import assert from 'node:assert/strict';
import { isLateInsertRelativeToReadCursor } from './lateInsertReadReceipt';

{
  // Classic late media: newer seq, older createdAt
  assert.equal(
    isLateInsertRelativeToReadCursor({
      messageServerSyncSeq: 100,
      messageCreatedAt: new Date('2026-01-01T12:00:00.000Z'),
      cursorReadMaxServerSyncSeq: 50,
      cursorReadMaxCreatedAt: new Date('2026-01-01T12:05:00.000Z'),
    }),
    true
  );
}

{
  // Normal new message after cursor
  assert.equal(
    isLateInsertRelativeToReadCursor({
      messageServerSyncSeq: 100,
      messageCreatedAt: new Date('2026-01-01T12:10:00.000Z'),
      cursorReadMaxServerSyncSeq: 50,
      cursorReadMaxCreatedAt: new Date('2026-01-01T12:05:00.000Z'),
    }),
    false
  );
}

{
  // Already covered by seq — not a late insert
  assert.equal(
    isLateInsertRelativeToReadCursor({
      messageServerSyncSeq: 40,
      messageCreatedAt: new Date('2026-01-01T12:00:00.000Z'),
      cursorReadMaxServerSyncSeq: 50,
      cursorReadMaxCreatedAt: new Date('2026-01-01T12:05:00.000Z'),
    }),
    false
  );
}

{
  // Null seq is never a late insert
  assert.equal(
    isLateInsertRelativeToReadCursor({
      messageServerSyncSeq: null,
      messageCreatedAt: new Date('2026-01-01T12:00:00.000Z'),
      cursorReadMaxServerSyncSeq: 50,
      cursorReadMaxCreatedAt: new Date('2026-01-01T12:05:00.000Z'),
    }),
    false
  );
}

console.log('lateInsertReadReceipt.test.ts: ok');
