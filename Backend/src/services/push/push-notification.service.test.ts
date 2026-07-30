import assert from 'node:assert/strict';
import { PUSH_CATEGORY_CHAT_REPLY } from './notifications/chat-push-reply.utils';
import {
  isDefinitivelyInvalidApnsToken,
  shouldSetApnsMutableContent,
} from './push-notification.service';

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

function testInvalidTokenClassification(): void {
  assert.equal(
    isDefinitivelyInvalidApnsToken({
      status: 400,
      response: { reason: 'BadDeviceToken' },
    }),
    true
  );
  assert.equal(
    isDefinitivelyInvalidApnsToken({
      status: 410,
      response: { reason: 'Unregistered' },
    }),
    true
  );
  for (const failure of [
    { status: 400, response: { reason: 'BadTopic' } },
    { status: 400, response: { reason: 'BadCollapseId' } },
    { status: 500, response: { reason: 'InternalServerError' } },
  ]) {
    assert.equal(isDefinitivelyInvalidApnsToken(failure), false);
  }
}

void (async () => {
  testMutableContentForHttpsPreview();
  testMutableContentForChatReplyCategory();
  testNoMutableContentWithoutPreviewOrChatReply();
  testNoMutableContentForHttpPreview();
  testInvalidTokenClassification();
  console.log('push-notification.service.test.ts: ok');
})();
