import assert from 'node:assert/strict';
import { MessageType } from '@prisma/client';
import {
  FORWARDABLE_MESSAGE_TYPES,
  parseForwardedFrom,
} from './forwardMessage.service';

assert.deepEqual(
  parseForwardedFrom({
    title: 'Ada',
    chatContextType: 'USER',
    contextId: 'uc1',
    messageId: 'm1',
    isChannel: true,
  }),
  {
    title: 'Ada',
    chatContextType: 'USER',
    contextId: 'uc1',
    messageId: 'm1',
    isChannel: true,
  }
);

assert.equal(parseForwardedFrom(null), null);
assert.equal(parseForwardedFrom({ title: 'x' }), null);
assert.equal(
  parseForwardedFrom({
    title: 'Ada',
    chatContextType: 'NOPE',
    contextId: 'uc1',
    messageId: 'm1',
  }),
  null
);

assert.equal(FORWARDABLE_MESSAGE_TYPES.has(MessageType.TEXT), true);
assert.equal(FORWARDABLE_MESSAGE_TYPES.has(MessageType.IMAGE), true);
assert.equal(FORWARDABLE_MESSAGE_TYPES.has(MessageType.STICKER), true);
assert.equal(FORWARDABLE_MESSAGE_TYPES.has(MessageType.VIDEO), true);
assert.equal(FORWARDABLE_MESSAGE_TYPES.has(MessageType.DOCUMENT), true);
assert.equal(FORWARDABLE_MESSAGE_TYPES.has(MessageType.VOICE), false);
assert.equal(FORWARDABLE_MESSAGE_TYPES.has(MessageType.POLL), false);

console.log('forwardMessage.service.test.ts: ok');
