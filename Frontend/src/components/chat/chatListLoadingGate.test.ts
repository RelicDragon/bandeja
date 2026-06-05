import { describe, expect, it } from 'vitest';
import { shouldEnterChatListLoadingState } from './chatListLoadingGate';

describe('shouldEnterChatListLoadingState', () => {
  it('skips loading when disk data was shown', () => {
    expect(shouldEnterChatListLoadingState(true, 0)).toBe(false);
  });

  it('skips loading when chats are already visible', () => {
    expect(shouldEnterChatListLoadingState(false, 3)).toBe(false);
  });

  it('allows loading only for empty cold fetch', () => {
    expect(shouldEnterChatListLoadingState(false, 0)).toBe(true);
  });
});
