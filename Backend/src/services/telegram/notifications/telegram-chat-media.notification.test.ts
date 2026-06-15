import assert from 'node:assert/strict';
import { sendTelegramChatMediaNotification } from './telegram-chat-media.notification';

type SentCall = { method: string; args: unknown[] };

function createMockApi(
  calls: SentCall[],
  options: { failPhoto?: boolean; failVideoUrl?: boolean; s3Buffer?: Buffer } = {}
): { api: any } {
  const api = {
    sendPhoto: async (...args: unknown[]) => {
      calls.push({ method: 'sendPhoto', args });
      if (options.failPhoto) {
        throw new Error('photo fetch failed');
      }
    },
    sendVideo: async (...args: unknown[]) => {
      calls.push({ method: 'sendVideo', args });
      if (options.failVideoUrl && typeof args[1] === 'string') {
        throw new Error('video URL fetch failed');
      }
    },
    sendMessage: async (...args: unknown[]) => {
      calls.push({ method: 'sendMessage', args });
    },
  };
  return { api };
}

async function testSendsPhotoForImage(): Promise<void> {
  const calls: SentCall[] = [];
  const { api } = createMockApi(calls);
  const thumb = '/uploads/chat/thumbnails/shot_thumb.jpg';

  await sendTelegramChatMediaNotification(api, {
    telegramId: 'tg-1',
    message: {
      messageType: 'IMAGE',
      mediaUrls: ['/uploads/chat/originals/shot.jpg'],
      thumbnailUrls: [thumb],
    },
    senderName: 'Ada',
    captionPrefix: '',
    buttons: [[{ text: 'Reply', callback_data: 'rum:1:2' }]],
    lang: 'en',
  });

  assert.equal(calls[0]?.method, 'sendPhoto');
  assert.match(String(calls[0]?.args[1]), /shot_thumb\.jpg/);
}

async function testSendsVideoWithThumbnail(): Promise<void> {
  const calls: SentCall[] = [];
  const { api } = createMockApi(calls);

  await sendTelegramChatMediaNotification(api, {
    telegramId: 'tg-2',
    message: {
      messageType: 'VIDEO',
      mediaUrls: ['/uploads/chat/originals/clip.mp4'],
      thumbnailUrls: ['/uploads/chat/thumbnails/clip_thumb.jpg'],
      videoDurationMs: 30000,
    },
    senderName: 'Bob',
    captionPrefix: 'Header',
    buttons: [[{ text: 'Reply', callback_data: 'rm:1:2:P' }]],
    lang: 'en',
  });

  assert.equal(calls[0]?.method, 'sendVideo');
  const options = calls[0]?.args[2] as { thumbnail?: string };
  assert.ok(options.thumbnail?.includes('clip_thumb.jpg'));
}

async function testVoiceUsesTextMessage(): Promise<void> {
  const calls: SentCall[] = [];
  const { api } = createMockApi(calls);

  await sendTelegramChatMediaNotification(api, {
    telegramId: 'tg-3',
    message: {
      messageType: 'VOICE',
      audioDurationMs: 45000,
    },
    senderName: 'Ann',
    captionPrefix: '',
    buttons: [[{ text: 'Reply', callback_data: 'rum:3:4' }]],
    lang: 'en',
  });

  assert.equal(calls[0]?.method, 'sendMessage');
  assert.match(String(calls[0]?.args[1]), /Voice message/);
}

async function testPhotoFailureFallsBackToText(): Promise<void> {
  const calls: SentCall[] = [];
  const { api } = createMockApi(calls, { failPhoto: true });

  await sendTelegramChatMediaNotification(api, {
    telegramId: 'tg-4',
    message: {
      messageType: 'IMAGE',
      mediaUrls: ['/uploads/chat/originals/fail.jpg'],
      thumbnailUrls: ['/uploads/chat/thumbnails/fail_thumb.jpg'],
    },
    senderName: 'Cam',
    captionPrefix: '',
    buttons: [[{ text: 'Reply', callback_data: 'rum:5:6' }]],
    lang: 'en',
  });

  assert.equal(calls[0]?.method, 'sendPhoto');
  assert.equal(calls[1]?.method, 'sendMessage');
  assert.match(String(calls[1]?.args[1]), /Photo/);
}

async function testVideoUrlFailureFallsBackToText(): Promise<void> {
  const calls: SentCall[] = [];
  const { api } = createMockApi(calls, { failVideoUrl: true });

  await sendTelegramChatMediaNotification(api, {
    telegramId: 'tg-5',
    message: {
      messageType: 'VIDEO',
      mediaUrls: ['https://d1afylun4w6qxe.cloudfront.net/uploads/chat/originals/clip.mp4'],
      thumbnailUrls: ['/uploads/chat/thumbnails/clip_thumb.jpg'],
      videoDurationMs: 30000,
    },
    senderName: 'Dan',
    captionPrefix: '',
    buttons: [[{ text: 'Reply', callback_data: 'rm:1:2:P' }]],
    lang: 'en',
  });

  assert.equal(calls[0]?.method, 'sendVideo');
  assert.equal(calls.at(-1)?.method, 'sendMessage');
  assert.match(String(calls.at(-1)?.args[1]), /Video/);
}

async function testStoryReplySendsPhoto(): Promise<void> {
  const calls: SentCall[] = [];
  const { api } = createMockApi(calls);
  const thumb = 'https://d1afylun4w6qxe.cloudfront.net/uploads/games/thumbnails/story_thumb.jpg';

  await sendTelegramChatMediaNotification(api, {
    telegramId: 'tg-6',
    message: {
      messageType: 'TEXT',
      content: 'Nice!',
      storyReply: {
        sourceType: 'GAME_PHOTO',
        sourceId: 'photo-1',
        ownerUserId: 'user-1',
        thumbnailUrl: thumb,
      },
    },
    senderName: 'Eve',
    captionPrefix: '',
    buttons: [[{ text: 'Reply', callback_data: 'rum:7:8' }]],
    lang: 'en',
  });

  assert.equal(calls[0]?.method, 'sendPhoto');
  assert.equal(calls[0]?.args[1], thumb);
}

void (async () => {
  await testSendsPhotoForImage();
  await testSendsVideoWithThumbnail();
  await testVoiceUsesTextMessage();
  await testPhotoFailureFallsBackToText();
  await testVideoUrlFailureFallsBackToText();
  await testStoryReplySendsPhoto();
  console.log('telegram-chat-media.notification.test.ts: ok');
})();
