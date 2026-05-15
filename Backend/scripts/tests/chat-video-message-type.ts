import { MessageType } from '@prisma/client';
import { resolveOutgoingChatMessageType } from '../../src/services/chat/resolveOutgoingChatMessageType';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(
  resolveOutgoingChatMessageType({
    mediaUrls: ['uploads/chat/videos/a.mp4'],
    requestedMessageType: MessageType.VIDEO,
  }) === MessageType.VIDEO,
  'explicit VIDEO stays VIDEO'
);

assert(
  resolveOutgoingChatMessageType({
    mediaUrls: ['uploads/chat/videos/a.mp4'],
  }) === MessageType.IMAGE,
  'video URL without messageType becomes IMAGE'
);

assert(
  resolveOutgoingChatMessageType({
    mediaUrls: ['uploads/chat/audio/a.m4a'],
    requestedMessageType: MessageType.VOICE,
  }) === MessageType.VOICE,
  'explicit VOICE'
);

assert(
  resolveOutgoingChatMessageType({ mediaUrls: [], requestedMessageType: MessageType.VIDEO }) ===
    MessageType.VIDEO,
  'VIDEO with empty mediaUrls still VIDEO (validation is separate)'
);

assert(resolveOutgoingChatMessageType({ mediaUrls: [] }) === MessageType.TEXT, 'empty → TEXT');

assert(
  resolveOutgoingChatMessageType({ poll: { question: 'q' }, mediaUrls: ['x'] }) === MessageType.POLL,
  'poll wins'
);

console.log('chat-video-message-type: ok');
