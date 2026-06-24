import { describe, expect, it } from 'vitest';
import type { MessageReadReceipt } from '@/api/chat';
import { mergeReadReceipts } from '../mergeReadReceipts';

function receipt(
  userId: string,
  readAt: string,
  messageId = 'm1'
): MessageReadReceipt {
  return { id: `r-${userId}`, messageId, userId, readAt };
}

describe('mergeReadReceipts', () => {
  it('appends a new user receipt', () => {
    const base = [receipt('u1', '2026-01-01T01:00:00.000Z')];
    const merged = mergeReadReceipts(base, receipt('u2', '2026-01-01T02:00:00.000Z'));
    expect(merged).toEqual([
      receipt('u1', '2026-01-01T01:00:00.000Z'),
      receipt('u2', '2026-01-01T02:00:00.000Z'),
    ]);
  });

  it('upgrades readAt when same userId sends a newer receipt', () => {
    const base = [receipt('u1', '2026-01-01T01:00:00.000Z')];
    const merged = mergeReadReceipts(base, receipt('u1', '2026-01-01T03:00:00.000Z'));
    expect(merged).toEqual([receipt('u1', '2026-01-01T03:00:00.000Z')]);
  });

  it('keeps newer readAt when incoming receipt is older', () => {
    const base = [receipt('u1', '2026-01-01T03:00:00.000Z')];
    const merged = mergeReadReceipts(base, receipt('u1', '2026-01-01T01:00:00.000Z'));
    expect(merged).toEqual([receipt('u1', '2026-01-01T03:00:00.000Z')]);
  });

  it('is idempotent for duplicate receipts', () => {
    const base = [receipt('u1', '2026-01-01T01:00:00.000Z')];
    const duplicate = receipt('u1', '2026-01-01T01:00:00.000Z');
    const merged = mergeReadReceipts(base, duplicate);
    expect(merged).toEqual(base);
  });

  it('merges batch incoming receipts across multiple users', () => {
    const base = [receipt('u1', '2026-01-01T01:00:00.000Z', 'm1')];
    const merged = mergeReadReceipts(base, [
      receipt('u2', '2026-01-01T02:00:00.000Z', 'm1'),
      receipt('u1', '2026-01-01T03:00:00.000Z', 'm1'),
    ]);
    expect(merged).toEqual([
      receipt('u2', '2026-01-01T02:00:00.000Z', 'm1'),
      receipt('u1', '2026-01-01T03:00:00.000Z', 'm1'),
    ]);
  });
});
