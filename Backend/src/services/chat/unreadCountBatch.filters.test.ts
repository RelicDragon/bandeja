import assert from 'node:assert/strict';
import { UnreadCountBatchService } from './unreadCountBatch.service';

function testBuildGameChatTypeFilter(): void {
  assert.deepEqual(
    UnreadCountBatchService.buildGameChatTypeFilter(
      { status: 'INVITED', role: 'PLAYER' },
      'ANNOUNCED',
    ),
    ['PUBLIC'],
  );
  assert.deepEqual(
    UnreadCountBatchService.buildGameChatTypeFilter(
      { status: 'PLAYING', role: 'PLAYER' },
      'ANNOUNCED',
    ),
    ['PUBLIC', 'PRIVATE'],
  );
  assert.deepEqual(
    UnreadCountBatchService.buildGameChatTypeFilter(
      { status: 'PLAYING', role: 'OWNER' },
      'ANNOUNCED',
    ),
    ['PUBLIC', 'PRIVATE', 'ADMINS'],
  );
  assert.deepEqual(
    UnreadCountBatchService.buildGameChatTypeFilter(
      { status: 'PLAYING', role: 'PLAYER' },
      'ANNOUNCED',
      true,
    ),
    ['PUBLIC', 'PRIVATE', 'ADMINS'],
  );
}

testBuildGameChatTypeFilter();
console.log('ok: unreadCountBatch.filters.test.ts');
