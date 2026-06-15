import assert from 'node:assert/strict';
import { NotificationType } from '../../types/notifications.types';
import { buildFcmMessage } from './fcm.service';

function testFcmIncludesAndroidImageWhenPreviewPresent(): void {
  const previewUrl = 'https://d1afylun4w6qxe.cloudfront.net/uploads/chat/thumbnails/photo_thumb.jpg';
  const message = buildFcmMessage('token-1', {
    type: NotificationType.USER_CHAT,
    title: 'Sender',
    body: '📷 Photo',
    data: {
      chatContextType: 'USER',
      contextId: 'chat-1',
      messageId: 'msg-1',
      previewImageUrl: previewUrl,
      previewMediaType: 'image',
      mediaCount: 1,
    },
  });

  assert.equal(message.android?.notification?.imageUrl, previewUrl);
  assert.equal(message.data?.previewImageUrl, previewUrl);
}

function testFcmOmitsAndroidImageWithoutPreview(): void {
  const message = buildFcmMessage('token-2', {
    type: NotificationType.USER_CHAT,
    title: 'Sender',
    body: 'Hello',
    data: {
      chatContextType: 'USER',
      contextId: 'chat-2',
      messageId: 'msg-2',
    },
  });

  assert.equal(message.android?.notification?.imageUrl, undefined);
}

void (async () => {
  testFcmIncludesAndroidImageWhenPreviewPresent();
  testFcmOmitsAndroidImageWithoutPreview();
  console.log('fcm.service.test.ts: ok');
})();
