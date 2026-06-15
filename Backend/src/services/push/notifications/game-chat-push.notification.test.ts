import assert from 'node:assert/strict';
import { ChatType, EntityType } from '@prisma/client';
import { NotificationType } from '../../../types/notifications.types';
import { createGameChatPushNotification } from './game-chat-push.notification';
import { PUSH_ACTION_REPLY } from './chat-push-reply.utils';

async function testGameChatPushIncludesReplyPayload(): Promise<void> {
  const payload = await createGameChatPushNotification(
    { id: 'msg-1', content: 'Game hello', chatType: ChatType.PUBLIC },
    {
      id: 'game-1',
      entityType: EntityType.GAME,
      timeIsSet: false,
      name: 'Friday match',
    },
    { id: 'sender-1', firstName: 'Bob', lastName: 'Smith' },
    { id: 'recipient-1', language: 'en', currentCityId: null }
  );

  assert.ok(payload);
  assert.equal(payload!.type, NotificationType.GAME_CHAT);
  assert.equal(payload!.data?.chatContextType, 'GAME');
  assert.equal(payload!.data?.contextId, 'game-1');
  assert.equal(payload!.data?.messageId, 'msg-1');
  assert.equal(payload!.data?.gameId, 'game-1');
  assert.equal(payload!.data?.chatType, ChatType.PUBLIC);
  assert.equal(payload!.actions?.length, 1);
  assert.equal(payload!.actions![0].id, PUSH_ACTION_REPLY);
  assert.equal(payload!.actions![0].input, true);
}

async function testGameChatPushPrivateChatType(): Promise<void> {
  const payload = await createGameChatPushNotification(
    { id: 'msg-2', content: 'Private note', chatType: ChatType.PRIVATE },
    {
      id: 'game-2',
      entityType: EntityType.GAME,
      timeIsSet: false,
    },
    { id: 'sender-2', firstName: 'Ann', lastName: 'Lee' },
    { id: 'recipient-2', language: 'en', currentCityId: null }
  );

  assert.ok(payload);
  assert.equal(payload!.data?.chatType, ChatType.PRIVATE);
}

async function testGameChatPushImagePreviewFields(): Promise<void> {
  const thumb = '/uploads/chat/thumbnails/game_thumb.jpg';
  const payload = await createGameChatPushNotification(
    {
      id: 'msg-img',
      messageType: 'IMAGE',
      mediaUrls: ['/uploads/chat/originals/game.jpg'],
      thumbnailUrls: [thumb],
    },
    {
      id: 'game-img',
      entityType: EntityType.GAME,
      timeIsSet: false,
      name: 'Saturday match',
    },
    { id: 'sender-img', firstName: 'Cam', lastName: 'Era' },
    { id: 'recipient-img', language: 'es-ES', currentCityId: null }
  );

  assert.ok(payload);
  assert.match(payload!.body, /📷 Foto/);
  assert.ok(payload!.data?.previewImageUrl?.includes('game_thumb.jpg'));
  assert.equal(payload!.data?.previewMediaType, 'image');
  assert.equal(payload!.data?.mediaCount, 1);
}

void (async () => {
  await testGameChatPushIncludesReplyPayload();
  await testGameChatPushPrivateChatType();
  await testGameChatPushImagePreviewFields();
  console.log('game-chat-push.notification.test.ts: ok');
})();
