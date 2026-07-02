import { describe, expect, it } from 'vitest';
import { buildMessageDetailsAudienceRows } from './messageDetailsAudience';

describe('buildMessageDetailsAudienceRows', () => {
  it('merges read receipts with reactions on the same user', () => {
    const rows = buildMessageDetailsAudienceRows(
      [{ id: 'r1', messageId: 'm1', userId: 'u2', readAt: '2026-07-02T10:00:00.000Z' }],
      [{ id: 'rx1', messageId: 'm1', userId: 'u2', emoji: '👍', createdAt: '2026-07-02T10:01:00.000Z' }],
      'u1',
      'u1'
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reaction?.emoji).toBe('👍');
    expect(rows[0]?.readAt).toBe('2026-07-02T10:00:00.000Z');
  });

  it('includes reaction-only users without read receipts', () => {
    const rows = buildMessageDetailsAudienceRows(
      [],
      [{ id: 'rx1', messageId: 'm1', userId: 'u2', emoji: '👍', createdAt: '2026-07-02T10:01:00.000Z' }],
      'u1',
      'u1'
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe('u2');
    expect(rows[0]?.readAt).toBeUndefined();
    expect(rows[0]?.reaction?.emoji).toBe('👍');
  });

  it('excludes sender and viewer reactions', () => {
    const rows = buildMessageDetailsAudienceRows(
      [],
      [
        { id: 'rx1', messageId: 'm1', userId: 'u1', emoji: '👍', createdAt: '2026-07-02T10:01:00.000Z' },
        { id: 'rx2', messageId: 'm1', userId: 'u3', emoji: '❤️', createdAt: '2026-07-02T10:02:00.000Z' },
      ],
      'u1',
      'u3'
    );
    expect(rows).toHaveLength(0);
  });
});
