import assert from 'node:assert/strict';
import {
  extractPreviewFromMessage,
  looksLikeGifMediaUrl,
} from './lastMessagePreview.service';

// looksLikeGifMediaUrl
assert.equal(looksLikeGifMediaUrl('https://cdn.example/chat/giphy-abc.gif'), true);
assert.equal(looksLikeGifMediaUrl('https://cdn.example/chat/giphy-abc.gif?w=200'), true);
assert.equal(looksLikeGifMediaUrl('https://cdn.example/chat/anim.gif.v1'), true);
assert.equal(looksLikeGifMediaUrl('https://cdn.example/chat/giphy.webp'), true);
assert.equal(looksLikeGifMediaUrl('https://media.giphy.com/media/abc/giphy.gif'), true);
assert.equal(looksLikeGifMediaUrl('https://media1.tenor.com/m/abc/aaa.gif'), true);
assert.equal(looksLikeGifMediaUrl('https://cdn.example/chat/photo.jpg'), false);
assert.equal(looksLikeGifMediaUrl('https://cdn.example/chat/regular.webp'), false);
assert.equal(looksLikeGifMediaUrl(''), false);
assert.equal(looksLikeGifMediaUrl(null), false);
assert.equal(looksLikeGifMediaUrl(undefined), false);

// extractPreviewFromMessage — GIF vs photo vs captioned gif
assert.equal(
  extractPreviewFromMessage({
    content: null,
    mediaUrls: ['https://cdn.example/chat/giphy-abc.gif'],
    pollId: null,
    messageType: 'IMAGE',
  }),
  '[TYPE:GIF]'
);

assert.equal(
  extractPreviewFromMessage({
    content: null,
    mediaUrls: ['https://cdn.example/chat/photo.jpg'],
    pollId: null,
    messageType: 'IMAGE',
  }),
  '[TYPE:MEDIA]'
);

// A captioned GIF still previews as its text (matches existing media+text behavior).
assert.equal(
  extractPreviewFromMessage({
    content: 'lol',
    mediaUrls: ['https://cdn.example/chat/giphy-abc.gif'],
    pollId: null,
    messageType: 'IMAGE',
  }),
  'lol'
);

// Sticker preview is unaffected.
assert.equal(
  extractPreviewFromMessage({
    content: null,
    mediaUrls: [],
    pollId: null,
    messageType: 'STICKER',
    stickerEmoji: '🎾',
  }),
  '[TYPE:STICKER]🎾'
);

assert.equal(
  extractPreviewFromMessage({
    content: null,
    mediaUrls: ['https://cdn.example/uploads/documents/a.pdf'],
    pollId: null,
    messageType: 'DOCUMENT',
    documentFileName: 'rules.pdf',
  }),
  '[TYPE:DOCUMENT]rules.pdf'
);

assert.equal(
  extractPreviewFromMessage({
    content: null,
    mediaUrls: ['https://cdn.example/uploads/documents/a.pdf'],
    pollId: null,
    messageType: 'DOCUMENT',
  }),
  '[TYPE:DOCUMENT]'
);

console.log('lastMessagePreview.service.test.ts: OK');
