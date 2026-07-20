import assert from 'node:assert/strict';
import {
  DECLINE_INVITE_PENDING_TTL_MS,
  isDeclineInvitePendingExpired,
  parseLeadingBotCommand,
} from './inviteDeclinePending';

assert.equal(parseLeadingBotCommand('/skip'), '/skip');
assert.equal(parseLeadingBotCommand('/SKIP'), '/skip');
assert.equal(parseLeadingBotCommand('/skip@BandejaBot'), '/skip');
assert.equal(parseLeadingBotCommand('/skip@BandejaBot extra'), '/skip');
assert.equal(parseLeadingBotCommand('hello'), null);
assert.equal(parseLeadingBotCommand('  /cancel '), '/cancel');

const pending = {
  kind: 'decline_invite' as const,
  inviteId: 'i',
  userId: 'u',
  lang: 'en',
  inviteMessageChatId: 1,
  inviteMessageId: 2,
  inviteMessageText: 't',
  createdAt: 1_000_000,
};
assert.equal(
  isDeclineInvitePendingExpired(pending, 1_000_000 + DECLINE_INVITE_PENDING_TTL_MS),
  false
);
assert.equal(
  isDeclineInvitePendingExpired(pending, 1_000_000 + DECLINE_INVITE_PENDING_TTL_MS + 1),
  true
);

console.log('inviteDeclinePending.test.ts: ok');
