import assert from 'node:assert/strict';
import { shouldSetApnsMutableContent } from './push-notification.service';

function testMutableContentForHttpsPreview(): void {
  assert.equal(
    shouldSetApnsMutableContent('https://d1afylun4w6qxe.cloudfront.net/uploads/chat/thumbnails/photo.jpg'),
    true
  );
}

function testNoMutableContentWithoutPreview(): void {
  assert.equal(shouldSetApnsMutableContent(undefined), false);
  assert.equal(shouldSetApnsMutableContent(''), false);
}

function testNoMutableContentForHttpPreview(): void {
  assert.equal(
    shouldSetApnsMutableContent('http://d1afylun4w6qxe.cloudfront.net/uploads/chat/thumbnails/photo.jpg'),
    false
  );
}

void (async () => {
  testMutableContentForHttpsPreview();
  testNoMutableContentWithoutPreview();
  testNoMutableContentForHttpPreview();
  console.log('push-notification.service.test.ts: ok');
})();
