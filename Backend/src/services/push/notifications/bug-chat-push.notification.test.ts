import assert from 'node:assert/strict';
import { NotificationType } from '../../../types/notifications.types';
import { createBugChatPushNotification } from './bug-chat-push.notification';
import { PUSH_ACTION_REPLY } from './chat-push-reply.utils';

async function testBugChatPushIncludesReplyPayload(): Promise<void> {
  const payload = await createBugChatPushNotification(
    { id: 'msg-1', content: 'Repro steps' },
    { id: 'bug-1', text: 'App crashes on launch' },
    { id: 'sender-1', firstName: 'Eve', lastName: 'Tester' },
    { id: 'recipient-1', language: 'en' }
  );

  assert.ok(payload);
  assert.equal(payload!.type, NotificationType.BUG_CHAT);
  assert.equal(payload!.data?.chatContextType, 'BUG');
  assert.equal(payload!.data?.contextId, 'bug-1');
  assert.equal(payload!.data?.messageId, 'msg-1');
  assert.equal(payload!.data?.bugId, 'bug-1');
  assert.equal(payload!.actions?.length, 1);
  assert.equal(payload!.actions![0].id, PUSH_ACTION_REPLY);
  assert.equal(payload!.actions![0].input, true);
}

async function testBugChatPushImagePreviewFields(): Promise<void> {
  const thumb = '/uploads/chat/thumbnails/bug_thumb.jpg';
  const payload = await createBugChatPushNotification(
    {
      id: 'msg-img',
      messageType: 'IMAGE',
      mediaUrls: ['/uploads/chat/originals/bug.jpg'],
      thumbnailUrls: [thumb],
    },
    { id: 'bug-img', text: 'Screenshot attached' },
    { id: 'sender-img', firstName: 'Cam', lastName: 'Era' },
    { id: 'recipient-img', language: 'es-ES' }
  );

  assert.ok(payload);
  assert.match(payload!.body, /📷 Foto/);
  assert.ok(payload!.data?.previewImageUrl?.includes('bug_thumb.jpg'));
  assert.equal(payload!.data?.previewMediaType, 'image');
  assert.equal(payload!.data?.mediaCount, 1);
}

void (async () => {
  await testBugChatPushIncludesReplyPayload();
  await testBugChatPushImagePreviewFields();
  console.log('bug-chat-push.notification.test.ts: ok');
})();
