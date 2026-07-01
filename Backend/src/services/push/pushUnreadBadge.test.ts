import assert from 'node:assert/strict';
import { NotificationType } from '../../types/notifications.types';
import {
  shouldAttachPushUnreadBadge,
  withPushUnreadBadge,
} from './pushUnreadBadge';

function testWithPushUnreadBadgeSetsPayloadAndData(): void {
  const payload = withPushUnreadBadge(
    {
      type: NotificationType.USER_CHAT,
      title: 'A',
      body: 'Hi',
      data: { messageId: 'm1' },
    },
    7.9
  );
  assert.equal(payload.badge, 7);
  assert.equal(payload.data?.unreadBadgeCount, 7);
}

function testShouldAttachOnlyForChatTypesWithoutExistingBadge(): void {
  assert.equal(
    shouldAttachPushUnreadBadge({
      type: NotificationType.USER_CHAT,
      title: 'A',
      body: 'Hi',
    }),
    true
  );
  assert.equal(
    shouldAttachPushUnreadBadge({
      type: NotificationType.INVITE,
      title: 'A',
      body: 'Hi',
    }),
    false
  );
  assert.equal(
    shouldAttachPushUnreadBadge({
      type: NotificationType.USER_CHAT,
      title: 'A',
      body: 'Hi',
      badge: 2,
    }),
    false
  );
}

void (async () => {
  testWithPushUnreadBadgeSetsPayloadAndData();
  testShouldAttachOnlyForChatTypesWithoutExistingBadge();
  console.log('pushUnreadBadge.test.ts: ok');
})();
