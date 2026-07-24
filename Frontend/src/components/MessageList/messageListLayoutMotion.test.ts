import { describe, expect, it } from 'vitest';

import { CHAT_LIST_HEIGHT_TRANSITION } from '@/components/chat/chatListMotion';
import { resolveMessageListLayoutMotion } from '@/components/MessageList/messageListLayoutMotion';

describe('resolveMessageListLayoutMotion', () => {
  it('disables all layout motion when prefers-reduced-motion', () => {
    const result = resolveMessageListLayoutMotion({
      reduceMotion: true,
      threadLayoutSettling: false,
      isNearBottom: true,
    });
    expect(result.heightTransition).toEqual({ duration: 0 });
    expect(result.rowLayoutTransitionEnabled).toBe(false);
  });

  it('uses instant layout mid-history (not near bottom, not settling)', () => {
    const result = resolveMessageListLayoutMotion({
      reduceMotion: false,
      threadLayoutSettling: false,
      isNearBottom: false,
    });
    expect(result.heightTransition).toEqual({ duration: 0 });
    expect(result.rowLayoutTransitionEnabled).toBe(false);
  });

  it('animates list height when near bottom and not settling', () => {
    const result = resolveMessageListLayoutMotion({
      reduceMotion: false,
      threadLayoutSettling: false,
      isNearBottom: true,
    });
    expect(result.heightTransition).toEqual(CHAT_LIST_HEIGHT_TRANSITION);
    expect(result.rowLayoutTransitionEnabled).toBe(true);
  });

  it('keeps height instant during settling but allows row transitions', () => {
    const result = resolveMessageListLayoutMotion({
      reduceMotion: false,
      threadLayoutSettling: true,
      isNearBottom: true,
    });
    expect(result.heightTransition).toEqual({ duration: 0 });
    expect(result.rowLayoutTransitionEnabled).toBe(true);
  });

  it('allows row transitions during settling even when not yet near bottom', () => {
    const result = resolveMessageListLayoutMotion({
      reduceMotion: false,
      threadLayoutSettling: true,
      isNearBottom: false,
    });
    expect(result.heightTransition).toEqual({ duration: 0 });
    expect(result.rowLayoutTransitionEnabled).toBe(true);
  });

  it('suppresses all layout motion during load-more / prepend windows', () => {
    const result = resolveMessageListLayoutMotion({
      reduceMotion: false,
      threadLayoutSettling: false,
      isNearBottom: true,
      suppressMotion: true,
    });
    expect(result.heightTransition).toEqual({ duration: 0 });
    expect(result.rowLayoutTransitionEnabled).toBe(false);
  });
});
