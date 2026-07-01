import assert from 'node:assert/strict';
import { ChatContextType, ChatType } from '@prisma/client';
import {
  getChatNotifier,
  setChatNotifierForTests,
  type ChatEventType,
  type ChatNotifier,
} from './chatNotifier';
import { socketChatNotifier } from './socketChatNotifier';

function makeRecordingNotifier(): ChatNotifier & {
  calls: string[];
  lastEventType?: ChatEventType;
} {
  const calls: string[] = [];
  let lastEventType: ChatEventType | undefined;
  return {
    calls,
    get lastEventType() {
      return lastEventType;
    },
    emitChatEvent(_ct, _cid, eventType) {
      calls.push('emitChatEvent');
      lastEventType = eventType;
    },
    recordMessageDelivery() {
      calls.push('recordMessageDelivery');
    },
    async emitUnreadCountUpdate() {
      calls.push('emitUnreadCountUpdate');
    },
    async emitUnreadAuthorityEnvelope() {
      calls.push('emitUnreadAuthorityEnvelope');
    },
    async emitUnreadInvalidate() {
      calls.push('emitUnreadInvalidate');
    },
    emitMessageTranslation() {
      calls.push('emitMessageTranslation');
    },
    emitPinnedMessagesUpdated() {
      calls.push('emitPinnedMessagesUpdated');
    },
    getUndeliveredRecipients() {
      calls.push('getUndeliveredRecipients');
      return [];
    },
    isUserOnline() {
      calls.push('isUserOnline');
      return false;
    },
    async isUserInChatRoom() {
      calls.push('isUserInChatRoom');
      return false;
    },
    markSocketDelivered() {
      calls.push('markSocketDelivered');
    },
    markPushDelivered() {
      calls.push('markPushDelivered');
    },
    emitMessageTranscription() {
      calls.push('emitMessageTranscription');
    },
  };
}

async function run() {
  setChatNotifierForTests(null);
  assert.equal(getChatNotifier(), socketChatNotifier);

  const mock = makeRecordingNotifier();
  setChatNotifierForTests(mock);
  assert.equal(getChatNotifier(), mock);

  const notifier = getChatNotifier();
  notifier.emitChatEvent(ChatContextType.GAME, 'game-1', 'message', { message: { id: 'm1' } });
  notifier.recordMessageDelivery('m1', ChatContextType.GAME, 'game-1', ['u2']);
  await notifier.emitUnreadCountUpdate(ChatContextType.GAME, 'game-1', 'u2', 1);
  notifier.getUndeliveredRecipients('m1');
  notifier.isUserOnline('u2');
  await notifier.isUserInChatRoom(ChatContextType.GAME, 'game-1', 'u2');

  assert.deepEqual(mock.calls, [
    'emitChatEvent',
    'recordMessageDelivery',
    'emitUnreadCountUpdate',
    'getUndeliveredRecipients',
    'isUserOnline',
    'isUserInChatRoom',
  ]);

  mock.calls.length = 0;
  notifier.emitChatEvent(ChatContextType.GAME, 'game-1', 'deleted', { messageId: 'm1' }, 'm1', 9);
  assert.equal(mock.lastEventType, 'deleted');
  assert.deepEqual(mock.calls, ['emitChatEvent']);

  setChatNotifierForTests(null);

  const prevSocket = (global as { socketService?: unknown }).socketService;
  delete (global as { socketService?: unknown }).socketService;
  try {
    socketChatNotifier.emitChatEvent(ChatContextType.GAME, 'g', 'message', {});
    socketChatNotifier.recordMessageDelivery('m', ChatContextType.GAME, 'g', []);
    await socketChatNotifier.emitUnreadCountUpdate(ChatContextType.GAME, 'g', 'u', 0);
    assert.deepEqual(socketChatNotifier.getUndeliveredRecipients('m'), []);
    assert.equal(socketChatNotifier.isUserOnline('u'), false);
    assert.equal(await socketChatNotifier.isUserInChatRoom(ChatContextType.GAME, 'g', 'u'), false);
  } finally {
    if (prevSocket !== undefined) {
      (global as { socketService?: unknown }).socketService = prevSocket;
    }
  }

  const delegated: string[] = [];
  (global as { socketService?: ChatNotifier }).socketService = {
    emitChatEvent() {
      delegated.push('emitChatEvent');
    },
    recordMessageDelivery() {
      delegated.push('recordMessageDelivery');
    },
    async emitUnreadCountUpdate() {
      delegated.push('emitUnreadCountUpdate');
    },
    async emitUnreadAuthorityEnvelope() {
      delegated.push('emitUnreadAuthorityEnvelope');
    },
    async emitUnreadInvalidate() {
      delegated.push('emitUnreadInvalidate');
    },
    emitMessageTranslation() {
      delegated.push('emitMessageTranslation');
    },
    emitPinnedMessagesUpdated() {
      delegated.push('emitPinnedMessagesUpdated');
    },
    getUndeliveredRecipients() {
      delegated.push('getUndeliveredRecipients');
      return ['u2'];
    },
    isUserOnline() {
      delegated.push('isUserOnline');
      return true;
    },
    async isUserInChatRoom() {
      delegated.push('isUserInChatRoom');
      return false;
    },
    markSocketDelivered() {
      delegated.push('markSocketDelivered');
    },
    markPushDelivered() {
      delegated.push('markPushDelivered');
    },
    emitMessageTranscription() {
      delegated.push('emitMessageTranscription');
    },
  };
  try {
    socketChatNotifier.emitChatEvent(ChatContextType.USER, 'uc', 'message', { x: 1 });
    socketChatNotifier.emitChatEvent(ChatContextType.USER, 'uc', 'deleted', { messageId: 'm3' });
    socketChatNotifier.recordMessageDelivery('m2', ChatContextType.USER, 'uc', ['u2']);
    await socketChatNotifier.emitUnreadCountUpdate(ChatContextType.USER, 'uc', 'u2', 3);
    await socketChatNotifier.emitUnreadAuthorityEnvelope('u2', {
      contextKey: 'USER:uc',
      contextType: 'USER',
      contextId: 'uc',
      unreadCount: 3,
      clock: { userUnreadRevision: 1, userContextUnreadRevision: 1 },
      reason: 'message_created',
    });
    socketChatNotifier.emitMessageTranslation(ChatContextType.USER, 'uc', 'm2', {
      languageCode: 'en',
      translation: 'hi',
    });
    socketChatNotifier.emitPinnedMessagesUpdated(ChatContextType.GAME, 'g', ChatType.PUBLIC);
    assert.deepEqual(socketChatNotifier.getUndeliveredRecipients('m2'), ['u2']);
    assert.equal(socketChatNotifier.isUserOnline('u2'), true);
    assert.equal(await socketChatNotifier.isUserInChatRoom(ChatContextType.USER, 'uc', 'u2'), false);
    socketChatNotifier.markSocketDelivered('m2', 'u2');
    socketChatNotifier.markPushDelivered('m2', 'u2');
    socketChatNotifier.emitMessageTranscription(ChatContextType.GAME, 'g', 'm2', {
      transcription: 'hello',
      languageCode: 'en',
    });
    assert.deepEqual(delegated, [
      'emitChatEvent',
      'emitChatEvent',
      'recordMessageDelivery',
      'emitUnreadCountUpdate',
      'emitUnreadAuthorityEnvelope',
      'emitMessageTranslation',
      'emitPinnedMessagesUpdated',
      'getUndeliveredRecipients',
      'isUserOnline',
      'isUserInChatRoom',
      'markSocketDelivered',
      'markPushDelivered',
      'emitMessageTranscription',
    ]);
  } finally {
    if (prevSocket !== undefined) {
      (global as { socketService?: unknown }).socketService = prevSocket;
    } else {
      delete (global as { socketService?: unknown }).socketService;
    }
  }

  console.log('chatNotifier.test: ok');
}

void run().catch((err) => {
  console.error(err);
  process.exit(1);
});
