import assert from 'node:assert/strict';
import { NotificationType } from '../../../types/notifications.types';
import {
  hasFullChatReplyContext,
  PUSH_CATEGORY_CHAT_REPLY,
  resolveApnsNotificationCategory,
  withChatPushReplyPayload,
} from './chat-push-reply.utils';

function testChatTypesUseChatReplyCategory(): void {
  for (const type of [
    NotificationType.USER_CHAT,
    NotificationType.GAME_CHAT,
    NotificationType.GROUP_CHAT,
    NotificationType.BUG_CHAT,
  ]) {
    assert.equal(
      resolveApnsNotificationCategory({
        type,
        title: 't',
        body: 'b',
        actions: [{ id: 'reply', title: 'Reply', action: 'reply', input: true }],
      }),
      PUSH_CATEGORY_CHAT_REPLY
    );
  }
}

function testInviteCategoryUnchanged(): void {
  assert.equal(
    resolveApnsNotificationCategory({
      type: NotificationType.INVITE,
      title: 't',
      body: 'b',
      actions: [{ id: 'accept', title: 'Accept', action: 'accept' }],
    }),
    NotificationType.INVITE
  );

  assert.equal(
    resolveApnsNotificationCategory({
      type: NotificationType.TEAM_INVITE,
      title: 't',
      body: 'b',
      actions: [{ id: 'accept', title: 'Accept', action: 'accept' }],
    }),
    NotificationType.TEAM_INVITE
  );
}

function testNoCategoryWithoutActions(): void {
  assert.equal(
    resolveApnsNotificationCategory({
      type: NotificationType.USER_CHAT,
      title: 't',
      body: 'b',
    }),
    undefined
  );
}

function testStoryStylePayloadHasNoReplyActions(): void {
  const { data, actions } = withChatPushReplyPayload(
    'USER',
    '',
    'msg-1',
    { sourceType: 'GAME', sourceId: 'src-1', userId: 'actor-1' },
    'en'
  );

  assert.deepEqual(data, {
    sourceType: 'GAME',
    sourceId: 'src-1',
    userId: 'actor-1',
  });
  assert.equal(actions, undefined);
  assert.equal(hasFullChatReplyContext(data), false);
}

function testFullChatReplyContext(): void {
  assert.equal(hasFullChatReplyContext(undefined), false);
  assert.equal(hasFullChatReplyContext({ sourceType: 'GAME', sourceId: 'x' }), false);
  assert.equal(
    hasFullChatReplyContext({
      chatContextType: 'USER',
      contextId: 'chat-1',
      messageId: 'msg-1',
    }),
    true
  );
}

testChatTypesUseChatReplyCategory();
testInviteCategoryUnchanged();
testNoCategoryWithoutActions();
testStoryStylePayloadHasNoReplyActions();
testFullChatReplyContext();

console.log('chat-push-reply.utils.test.ts: ok');
