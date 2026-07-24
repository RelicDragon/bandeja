import assert from 'node:assert/strict';
import { MessageType } from '@prisma/client';
import { resolveOutgoingChatMessageType } from './resolveOutgoingChatMessageType';

function resolve(partial: {
  poll?: unknown;
  requestedMessageType?: MessageType;
  stickerId?: string | null;
  mediaUrls?: string[];
}) {
  return resolveOutgoingChatMessageType({
    mediaUrls: partial.mediaUrls ?? [],
    poll: partial.poll,
    requestedMessageType: partial.requestedMessageType,
    stickerId: partial.stickerId,
  });
}

assert.equal(resolve({ poll: { question: 'x' } }), MessageType.POLL);
assert.equal(
  resolve({
    poll: { question: 'x' },
    stickerId: 's1',
    requestedMessageType: MessageType.STICKER,
    mediaUrls: ['http://x'],
  }),
  MessageType.POLL,
  'poll wins over sticker and media'
);

assert.equal(
  resolve({ requestedMessageType: MessageType.STICKER, stickerId: 's1' }),
  MessageType.STICKER
);
assert.equal(resolve({ stickerId: 's1' }), MessageType.STICKER, 'stickerId alone implies STICKER');
assert.equal(
  resolve({
    requestedMessageType: MessageType.STICKER,
    stickerId: 's1',
    mediaUrls: ['http://x'],
  }),
  MessageType.STICKER,
  'sticker precedes mediaUrls (conflict handled elsewhere)'
);
assert.equal(
  resolve({
    requestedMessageType: MessageType.VOICE,
    stickerId: 's1',
  }),
  MessageType.STICKER,
  'sticker precedes voice when stickerId present'
);

assert.equal(resolve({ requestedMessageType: MessageType.VOICE }), MessageType.VOICE);
assert.equal(resolve({ requestedMessageType: MessageType.VIDEO }), MessageType.VIDEO);
assert.equal(resolve({ requestedMessageType: MessageType.DOCUMENT }), MessageType.DOCUMENT);
assert.equal(
  resolve({
    requestedMessageType: MessageType.DOCUMENT,
    mediaUrls: ['https://cdn/doc.pdf'],
  }),
  MessageType.DOCUMENT,
  'DOCUMENT precedes mediaUrls→IMAGE'
);
assert.equal(resolve({ mediaUrls: ['https://cdn/x.gif'] }), MessageType.IMAGE);
assert.equal(resolve({}), MessageType.TEXT);
assert.equal(
  resolve({ requestedMessageType: MessageType.IMAGE as MessageType }),
  MessageType.TEXT,
  'client IMAGE without mediaUrls is text (Giphy path fills mediaUrls first)'
);

console.log('resolveOutgoingChatMessageType.test.ts: ok');
