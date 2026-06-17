import { describe, expect, it } from 'vitest';
import { buildPushReplyClientMutationId } from './pushReplyClientMutationId';

describe('buildPushReplyClientMutationId', () => {
  it('uses stable token-scoped id without colons', async () => {
    const id = await buildPushReplyClientMutationId(
      { messageId: 'msg-1', replyToken: 'reply-token-value' },
      'hello'
    );
    expect(id).toMatch(/^push-reply-token-[0-9a-f]{48}$/);
    expect(id).not.toContain(':');
    const again = await buildPushReplyClientMutationId(
      { messageId: 'msg-1', replyToken: 'reply-token-value' },
      'different content'
    );
    expect(again).toBe(id);
  });

  it('scopes jwt fallback to message and content', async () => {
    const id = await buildPushReplyClientMutationId({ messageId: 'msg-abc' }, 'hello');
    expect(id).toMatch(/^push-reply-msg-msg-abc-[0-9a-f]{16}$/);
    expect(id).not.toContain(':');
  });
});
