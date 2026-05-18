import { shouldNotifyParentGameAdminForMessage } from '../../src/services/chat/gameChatVisibility';

const parentId = 'parent-admin-1';
const otherId = 'user-2';

function assert(label: string, got: boolean, expected: boolean) {
  if (got !== expected) {
    console.error(`FAIL: ${label} — expected ${expected}, got ${got}`);
    process.exit(1);
  }
  console.log(`ok: ${label}`);
}

assert('plain message', shouldNotifyParentGameAdminForMessage(parentId, {}), false);

assert(
  'mentioned via mentionIds',
  shouldNotifyParentGameAdminForMessage(parentId, { mentionIds: [otherId, parentId] }),
  true
);

assert(
  'reply to parent admin',
  shouldNotifyParentGameAdminForMessage(parentId, {
    replyTo: { sender: { id: parentId } },
  }),
  true
);

assert(
  'reply to someone else',
  shouldNotifyParentGameAdminForMessage(parentId, {
    replyTo: { sender: { id: otherId } },
  }),
  false
);

assert(
  'mention wins over unrelated reply',
  shouldNotifyParentGameAdminForMessage(parentId, {
    mentionIds: [parentId],
    replyTo: { sender: { id: otherId } },
  }),
  true
);

assert(
  'missing reply sender',
  shouldNotifyParentGameAdminForMessage(parentId, { replyTo: { sender: {} } }),
  false
);

assert(
  'null replyTo',
  shouldNotifyParentGameAdminForMessage(parentId, { mentionIds: [], replyTo: null }),
  false
);

console.log('\nAll game-chat parent-admin notify checks passed.');
