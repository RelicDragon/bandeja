import assert from 'node:assert/strict';
import { MessageType } from '@prisma/client';
import {
  FORWARDABLE_MESSAGE_TYPES,
  assertForwardMediaUrlsAllowed,
  parseForwardedFrom,
} from './forwardMessage.service';
import { ApiError } from '../../utils/ApiError';

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
assert.equal(FORWARDABLE_MESSAGE_TYPES.has(MessageType.VOICE), true);
assert.equal(FORWARDABLE_MESSAGE_TYPES.has(MessageType.POLL), true);

assert.doesNotThrow(() =>
  assertForwardMediaUrlsAllowed(['https://cdn.example.com/uploads/chat/originals/a.gif'])
);
assert.throws(
  () => assertForwardMediaUrlsAllowed(['https://media.giphy.com/media/abc/giphy.gif']),
  (err: unknown) => err instanceof ApiError && err.data?.code === 'chat.forward.providerMedia'
);
assert.throws(
  () => assertForwardMediaUrlsAllowed(['https://media1.tenor.com/m/abc/x.gif']),
  (err: unknown) => err instanceof ApiError && err.data?.code === 'chat.forward.providerMedia'
);

console.log('forwardMessage.service.test.ts: ok');
