import assert from 'node:assert/strict';
import { resolveGroupChatNotificationPath } from './groupChatNotificationPath';

function testBugPath(): void {
  assert.equal(
    resolveGroupChatNotificationPath({ id: 'c1', bug: { id: 'b1' } }),
    '/bugs/c1'
  );
}

function testMarketPathKeepsFilter(): void {
  assert.equal(
    resolveGroupChatNotificationPath({ id: 'c2', marketItem: { id: 'm1' } }),
    '/channel-chat/c2?filter=market'
  );
}

function testPlainGroupPath(): void {
  assert.equal(resolveGroupChatNotificationPath({ id: 'c3' }), '/group-chat/c3');
}

void (() => {
  testBugPath();
  testMarketPathKeepsFilter();
  testPlainGroupPath();
  console.log('groupChatNotificationPath.test.ts: ok');
})();
