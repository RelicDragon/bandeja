import { describe, expect, it } from 'vitest';
import { bugPatchFromSystemMessage } from './bugSystemMessagePatch';

const msg = (type: string, variables: Record<string, string>) => JSON.stringify({ type, variables, text: 'x' });

describe('bugPatchFromSystemMessage', () => {
  it('maps wire variables back to bug fields', () => {
    expect(bugPatchFromSystemMessage(msg('BUG_STATUS_CHANGED', { status: 'in_progress' }))).toEqual({ status: 'IN_PROGRESS' });
    expect(bugPatchFromSystemMessage(msg('BUG_TYPE_CHANGED', { type: 'review' }))).toEqual({ bugType: 'REVIEW' });
    expect(bugPatchFromSystemMessage(msg('BUG_PRIORITY_CHANGED', { priority: '+2' }))).toEqual({ priority: 2 });
    expect(bugPatchFromSystemMessage(msg('BUG_PRIORITY_CHANGED', { priority: '-1' }))).toEqual({ priority: -1 });
    expect(bugPatchFromSystemMessage(msg('BUG_RATING_CHANGED', { rating: '4' }))).toEqual({ priority: 4 });
  });

  it('ignores ordinary and unrelated system messages', () => {
    expect(bugPatchFromSystemMessage('hello BUG_STATUS_CHANGED')).toBeNull();
    expect(bugPatchFromSystemMessage(msg('USER_JOINED_CHAT', { userName: 'A' }))).toBeNull();
    expect(bugPatchFromSystemMessage(undefined)).toBeNull();
  });
});
