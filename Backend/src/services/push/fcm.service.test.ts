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

function testFcmIncludesUnreadBadgeInData(): void {
  const message = buildFcmMessage('token-3', {
    type: NotificationType.USER_CHAT,
    title: 'Sender',
    body: 'Hello',
    badge: 12,
    data: {
      chatContextType: 'USER',
      contextId: 'chat-3',
      messageId: 'msg-3',
      unreadBadgeCount: 12,
    },
  });

  assert.equal(message.data?.unreadBadgeCount, '12');
}

function testFcmCollapsesOutboxRetries(): void {
  const message = buildFcmMessage('token-4', {
    type: NotificationType.FOLLOWED_USER_PLAY_INTENT,
    title: 'A friend wants to play',
    body: 'Tap to join',
    data: {
      playIntentId: 'intent-1',
      deliveryKey: 'FOLLOWED_USER_PLAY_INTENT:intent-1',
    },
  });

  assert.equal(message.android?.collapseKey?.length, 64);
  assert.equal(
    message.data?.deliveryKey,
    'FOLLOWED_USER_PLAY_INTENT:intent-1',
  );
}

void (async () => {
  testFcmIncludesAndroidImageWhenPreviewPresent();
  testFcmOmitsAndroidImageWithoutPreview();
  testFcmIncludesUnreadBadgeInData();
  testFcmCollapsesOutboxRetries();
  console.log('fcm.service.test.ts: ok');
})();
