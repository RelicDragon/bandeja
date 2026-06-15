import assert from 'node:assert/strict';
import { PUSH_CATEGORY_CHAT_REPLY } from './notifications/chat-push-reply.utils';
import { shouldSetApnsMutableContent } from './push-notification.service';

function testMutableContentForHttpsPreview(): void {
  assert.equal(
    shouldSetApnsMutableContent(undefined, 'https://d1afylun4w6qxe.cloudfront.net/uploads/chat/thumbnails/photo.jpg'),
    true
  );
}

function testMutableContentForChatReplyCategory(): void {
  assert.equal(shouldSetApnsMutableContent(PUSH_CATEGORY_CHAT_REPLY, undefined), true);
  assert.equal(shouldSetApnsMutableContent(PUSH_CATEGORY_CHAT_REPLY, ''), true);
}

function testNoMutableContentWithoutPreviewOrChatReply(): void {
  assert.equal(shouldSetApnsMutableContent(undefined, undefined), false);
  assert.equal(shouldSetApnsMutableContent(undefined, ''), false);
  assert.equal(shouldSetApnsMutableContent('INVITE', undefined), false);
}

function testNoMutableContentForHttpPreview(): void {
  assert.equal(
    shouldSetApnsMutableContent(undefined, 'http://d1afylun4w6qxe.cloudfront.net/uploads/chat/thumbnails/photo.jpg'),
    false
  );
}

void (async () => {
  testMutableContentForHttpsPreview();
  testMutableContentForChatReplyCategory();
  testNoMutableContentWithoutPreviewOrChatReply();
  testNoMutableContentForHttpPreview();
  console.log('push-notification.service.test.ts: ok');
})();
