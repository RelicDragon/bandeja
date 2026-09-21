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

/**
 * PRD 346 — the iOS client registers a `GAME_REMINDER` category with exactly
 * these two action ids (`registerPushNotificationActionTypes.ts`). If the
 * resolved category or the ids drift, the shade silently shows no buttons.
 */
function testAttendanceReminderUsesGameReminderCategory(): void {
  assert.equal(
    resolveApnsNotificationCategory({
      type: NotificationType.GAME_REMINDER,
      title: 't',
      body: 'b',
      actions: [
        { id: 'confirm', title: "I'm coming", action: 'confirm' },
        { id: 'unsure', title: 'Not sure yet', action: 'unsure' },
      ],
    }),
    NotificationType.GAME_REMINDER
  );

  // A reminder without the attendance actions must not claim the category.
  assert.equal(
    resolveApnsNotificationCategory({
      type: NotificationType.GAME_REMINDER,
      title: 't',
      body: 'b',
    }),
    undefined
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
testAttendanceReminderUsesGameReminderCategory();
testNoCategoryWithoutActions();
testStoryStylePayloadHasNoReplyActions();
testFullChatReplyContext();

console.log('chat-push-reply.utils.test.ts: ok');
