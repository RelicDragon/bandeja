import assert from 'node:assert/strict';
import { resolveChatNotificationMediaPreview } from './chat-notification-media-preview';

const THUMB_PATH = '/uploads/chat/thumbnails/abc_thumb.jpg';
const ORIGINAL_PATH = '/uploads/chat/originals/abc.jpg';

function testImageWithThumbnail(): void {
  const preview = resolveChatNotificationMediaPreview({
    messageType: 'IMAGE',
    mediaUrls: [ORIGINAL_PATH],
    thumbnailUrls: [THUMB_PATH],
  }, 'en');

  assert.equal(preview.body, '📷 Photo');
  assert.ok(preview.previewImageUrl?.includes('uploads/chat/thumbnails/abc_thumb.jpg'));
  assert.equal(preview.previewMediaType, 'image');
  assert.equal(preview.mediaCount, 1);
}

function testImageCaption(): void {
  const preview = resolveChatNotificationMediaPreview({
    messageType: 'IMAGE',
    content: 'Look at this',
    mediaUrls: [ORIGINAL_PATH],
    thumbnailUrls: [THUMB_PATH],
  }, 'en');

  assert.equal(preview.body, 'Look at this');
  assert.ok(preview.previewImageUrl);
}

function testMultiImageCount(): void {
  const preview = resolveChatNotificationMediaPreview({
    messageType: 'IMAGE',
    mediaUrls: [ORIGINAL_PATH, ORIGINAL_PATH, ORIGINAL_PATH],
    thumbnailUrls: [THUMB_PATH],
  }, 'en');

  assert.match(preview.body, /📷 Photo \(\+2\)/);
  assert.equal(preview.mediaCount, 3);
}

function testVideoPoster(): void {
  const preview = resolveChatNotificationMediaPreview({
    messageType: 'VIDEO',
    mediaUrls: [ORIGINAL_PATH],
    thumbnailUrls: [THUMB_PATH],
    videoDurationMs: 125000,
  }, 'en');

  assert.equal(preview.body, '🎬 Video (2:05)');
  assert.equal(preview.previewMediaType, 'video');
  assert.ok(preview.previewImageUrl);
}

function testVoiceNoPreview(): void {
  const preview = resolveChatNotificationMediaPreview({
    messageType: 'VOICE',
    audioDurationMs: 65000,
  }, 'en');

  assert.equal(preview.body, '🎤 Voice message (1:05)');
  assert.equal(preview.previewImageUrl, undefined);
}

function testTextOnly(): void {
  const preview = resolveChatNotificationMediaPreview({
    messageType: 'TEXT',
    content: 'Hello there',
  }, 'en');

  assert.equal(preview.body, 'Hello there');
  assert.equal(preview.previewImageUrl, undefined);
}

function testMissingThumbFallbackLabel(): void {
  const preview = resolveChatNotificationMediaPreview({
    messageType: 'IMAGE',
    mediaUrls: [ORIGINAL_PATH],
  }, 'en');

  assert.equal(preview.body, '📷 Photo');
  assert.ok(preview.previewImageUrl?.includes('thumbnails'));
  assert.equal(preview.previewImageUrl?.includes('originals'), false);
}

function testNeverUsesOriginalUrl(): void {
  const preview = resolveChatNotificationMediaPreview({
    messageType: 'IMAGE',
    mediaUrls: [ORIGINAL_PATH],
    thumbnailUrls: [ORIGINAL_PATH],
  }, 'en');

  assert.ok(preview.previewImageUrl?.includes('thumbnails'));
}

function testStoryReplyThumbnail(): void {
  const thumb = 'https://d1afylun4w6qxe.cloudfront.net/uploads/games/thumbnails/story_thumb.jpg';
  const preview = resolveChatNotificationMediaPreview({
    messageType: 'TEXT',
    content: 'Nice shot!',
    storyReply: {
      sourceType: 'GAME_PHOTO',
      sourceId: 'photo-1',
      ownerUserId: 'user-1',
      thumbnailUrl: thumb,
    },
  }, 'en');

  assert.equal(preview.previewImageUrl, thumb);
  assert.equal(preview.previewMediaType, 'image');
  assert.match(preview.body, /story/i);
}

function testStoryReplyWithoutThumb(): void {
  const preview = resolveChatNotificationMediaPreview({
    messageType: 'TEXT',
    content: 'Hello',
    storyReply: {
      sourceType: 'USER_STORY_ITEM',
      sourceId: 'story-1',
      ownerUserId: 'user-1',
    },
  }, 'en');

  assert.equal(preview.previewImageUrl, undefined);
  assert.equal(preview.previewMediaType, undefined);
}

void (async () => {
  testImageWithThumbnail();
  testImageCaption();
  testMultiImageCount();
  testVideoPoster();
  testVoiceNoPreview();
  testTextOnly();
  testMissingThumbFallbackLabel();
  testNeverUsesOriginalUrl();
  testStoryReplyThumbnail();
  testStoryReplyWithoutThumb();
  console.log('chat-notification-media-preview.test.ts: ok');
})();
