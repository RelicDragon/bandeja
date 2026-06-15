import assert from 'node:assert/strict';
import { NotificationType } from '../../../types/notifications.types';
import { createUserChatPushNotification } from './user-chat-push.notification';
import { PUSH_ACTION_REPLY } from './chat-push-reply.utils';

async function testUserChatPushIncludesReplyPayload(): Promise<void> {
  const payload = await createUserChatPushNotification(
    { id: 'msg-1', content: 'Hello' },
    { id: 'chat-1' },
    { id: 'sender-1', firstName: 'Ada', lastName: 'Lovelace' },
    { id: 'recipient-1', language: 'en' }
  );

  assert.ok(payload);
  assert.equal(payload!.type, NotificationType.USER_CHAT);
  assert.equal(payload!.data?.chatContextType, 'USER');
  assert.equal(payload!.data?.contextId, 'chat-1');
  assert.equal(payload!.data?.messageId, 'msg-1');
  assert.equal(payload!.data?.userChatId, 'chat-1');
  assert.equal(payload!.data?.userId, 'sender-1');
  assert.equal(payload!.actions?.length, 1);
  assert.equal(payload!.actions![0].id, PUSH_ACTION_REPLY);
  assert.equal(payload!.actions![0].input, true);
  assert.equal(payload!.actions![0].title, 'Reply');
}

async function testUserChatPushLocalizedReplyTitle(): Promise<void> {
  const payload = await createUserChatPushNotification(
    { id: 'msg-2', content: 'Hola' },
    { id: 'chat-2' },
    { id: 'sender-2', firstName: 'Test', lastName: 'User' },
    { id: 'recipient-2', language: 'es' }
  );

  assert.ok(payload);
  assert.equal(payload!.actions![0].title, 'Responder');
}

async function testUserChatPushImagePreviewFields(): Promise<void> {
  const thumb = '/uploads/chat/thumbnails/preview_thumb.jpg';
  const payload = await createUserChatPushNotification(
    {
      id: 'msg-img',
      messageType: 'IMAGE',
      mediaUrls: ['/uploads/chat/originals/preview.jpg'],
      thumbnailUrls: [thumb],
    },
    { id: 'chat-img' },
    { id: 'sender-img', firstName: 'Cam', lastName: 'Era' },
    { id: 'recipient-img', language: 'en' }
  );

  assert.ok(payload);
  assert.equal(payload!.body, '📷 Photo');
  assert.ok(payload!.data?.previewImageUrl?.includes('preview_thumb.jpg'));
  assert.equal(payload!.data?.previewMediaType, 'image');
  assert.equal(payload!.data?.mediaCount, 1);
}

void (async () => {
  await testUserChatPushIncludesReplyPayload();
  await testUserChatPushLocalizedReplyTitle();
  await testUserChatPushImagePreviewFields();
  console.log('user-chat-push.notification.test.ts: ok');
})();
