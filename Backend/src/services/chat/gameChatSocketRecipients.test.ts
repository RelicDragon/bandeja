import assert from 'node:assert/strict';
import { ChatType } from '@prisma/client';
import { extractChatTypeFromEmitPayload } from './gameChatSocketRecipients';

function testExtractFromMessagePayload(): void {
  assert.equal(
    extractChatTypeFromEmitPayload({ message: { id: 'm1', chatType: ChatType.ADMINS } }),
    ChatType.ADMINS
  );
  assert.equal(
    extractChatTypeFromEmitPayload({ message: { chatType: ChatType.PUBLIC } }),
    ChatType.PUBLIC
  );
}

function testExtractFromDirectChatType(): void {
  assert.equal(extractChatTypeFromEmitPayload({ chatType: ChatType.PRIVATE }), ChatType.PRIVATE);
}

function testExtractReturnsUndefinedWhenMissing(): void {
  assert.equal(extractChatTypeFromEmitPayload({ messageId: 'm1' }), undefined);
  assert.equal(extractChatTypeFromEmitPayload(null), undefined);
}

async function run(): Promise<void> {
  testExtractFromMessagePayload();
  testExtractFromDirectChatType();
  testExtractReturnsUndefinedWhenMissing();
  console.log('gameChatSocketRecipients.test.ts: ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
