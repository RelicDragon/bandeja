import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import prisma from '../../config/database';
import { PushReplyTokenService } from './pushReplyToken.service';
import { resetPushReplyMetricsForTests, getPushReplyMetrics } from './push-reply-metrics';
import { ChatContextType } from '@prisma/client';

async function run() {
  resetPushReplyMetricsForTests();

  const recipient = await prisma.user.findFirst({ select: { id: true } });
  if (!recipient) {
    console.log('pushReplyToken.service.test.ts: skipped (no users in database)');
    return;
  }

  const scope = {
    recipientUserId: recipient.id,
    chatContextType: ChatContextType.USER,
    contextId: 'chat-1',
    messageId: 'msg-1',
  };

  const token = await PushReplyTokenService.generate(scope);
  assert.ok(token.length >= 16);

  const validated = await PushReplyTokenService.validate(token);
  assert.equal(validated.recipientUserId, scope.recipientUserId);
  assert.equal(validated.alreadyUsed, false);

  const receiptScope = await PushReplyTokenService.validateForReceipt(token);
  assert.equal(receiptScope.messageId, scope.messageId);
  assert.equal(receiptScope.recipientUserId, scope.recipientUserId);

  await PushReplyTokenService.markUsed(validated.tokenId, 'reply-msg-1');
  const receiptAfterUse = await PushReplyTokenService.validateForReceipt(token);
  assert.equal(receiptAfterUse.messageId, scope.messageId);

  const hash = createHash('sha256').update(token).digest('hex');
  assert.ok(hash.length === 64);

  try {
    await PushReplyTokenService.validate('short');
    assert.fail('expected malformed token to fail');
  } catch (e: unknown) {
    assert.equal((e as { statusCode?: number }).statusCode, 401);
  }

  const metrics = getPushReplyMetrics();
  assert.ok(metrics.invalidToken >= 1);

  const expiredToken = await PushReplyTokenService.generate(scope);
  const expiredHash = createHash('sha256').update(expiredToken).digest('hex');
  await prisma.pushReplyToken.update({
    where: { tokenHash: expiredHash },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  });
  const purged = await PushReplyTokenService.purgeExpired();
  assert.ok(purged >= 1);
  const expiredRow = await prisma.pushReplyToken.findUnique({ where: { tokenHash: expiredHash } });
  assert.equal(expiredRow, null);

  await prisma.pushReplyToken.deleteMany({ where: { recipientUserId: recipient.id } });

  console.log('pushReplyToken.service.test.ts: ok');
}

run().catch((err) => {
  console.error('pushReplyToken.service.test.ts:', err);
  process.exit(1);
});
