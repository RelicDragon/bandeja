import assert from 'node:assert/strict';
import { NotificationType } from '../../../types/notifications.types';
import { createGroupChatPushNotification } from './group-chat-push.notification';
import { PUSH_ACTION_REPLY } from './chat-push-reply.utils';

async function testGroupChatPushIncludesReplyPayload(): Promise<void> {
  const payload = await createGroupChatPushNotification(
    { id: 'msg-1', content: 'Group hello' },
    { id: 'channel-1', name: 'City crew', isChannel: false },
    { id: 'sender-1', firstName: 'Cara', lastName: 'Diaz' },
    { id: 'recipient-1', language: 'en' }
  );

  assert.ok(payload);
  assert.equal(payload!.type, NotificationType.GROUP_CHAT);
  assert.equal(payload!.data?.chatContextType, 'GROUP');
  assert.equal(payload!.data?.contextId, 'channel-1');
  assert.equal(payload!.data?.messageId, 'msg-1');
  assert.equal(payload!.data?.groupChannelId, 'channel-1');
  assert.equal(payload!.actions?.length, 1);
  assert.equal(payload!.actions![0].id, PUSH_ACTION_REPLY);
  assert.equal(payload!.actions![0].input, true);
}

async function testGroupChatPushPreservesLegacyIds(): Promise<void> {
  const payload = await createGroupChatPushNotification(
    { id: 'msg-2', content: 'Bug thread' },
    {
      id: 'channel-2',
      name: 'Crash report',
      bug: { id: 'bug-9' },
      marketItem: { id: 'item-3' },
    },
    { id: 'sender-2', firstName: 'Dev', lastName: 'One' },
    { id: 'recipient-2', language: 'en' }
  );

  assert.ok(payload);
  assert.equal(payload!.data?.bugId, 'bug-9');
  assert.equal(payload!.data?.marketItemId, 'item-3');
}

async function testGroupChatPushReturnsNullWithoutContext(): Promise<void> {
  const payload = await createGroupChatPushNotification(
    null,
    { id: 'channel-3', name: 'Empty' },
    { id: 'sender-3', firstName: 'No', lastName: 'Msg' },
    { id: 'recipient-3', language: 'en' }
  );

  assert.equal(payload, null);
}

async function testGroupChatPushImagePreviewFields(): Promise<void> {
  const thumb = '/uploads/chat/thumbnails/group_thumb.jpg';
  const payload = await createGroupChatPushNotification(
    {
      id: 'msg-img',
      messageType: 'IMAGE',
      mediaUrls: ['/uploads/chat/originals/group.jpg'],
      thumbnailUrls: [thumb],
    },
    { id: 'channel-img', name: 'City crew', isChannel: false },
    { id: 'sender-img', firstName: 'Cam', lastName: 'Era' },
    { id: 'recipient-img', language: 'ru-RU' }
  );

  assert.ok(payload);
  assert.match(payload!.body, /📷 Фото/);
  assert.ok(payload!.data?.previewImageUrl?.includes('group_thumb.jpg'));
  assert.equal(payload!.data?.previewMediaType, 'image');
  assert.equal(payload!.data?.mediaCount, 1);
}

void (async () => {
  await testGroupChatPushIncludesReplyPayload();
  await testGroupChatPushPreservesLegacyIds();
  await testGroupChatPushReturnsNullWithoutContext();
  await testGroupChatPushImagePreviewFields();
  console.log('group-chat-push.notification.test.ts: ok');
})();
