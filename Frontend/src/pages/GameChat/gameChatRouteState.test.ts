import { describe, expect, it } from 'vitest';
import {
  resolveGameChatViewState,
  shouldDenyArchivedGameChatRouteOnMessageError,
  shouldInitializeGameChatContextLoading,
} from './gameChatRouteState';

describe('gameChatRouteState', () => {
  it('starts embedded game chat in loading state', () => {
    expect(
      shouldInitializeGameChatContextLoading({
        contextType: 'GAME',
        isEmbedded: true,
      })
    ).toBe(true);
  });

  it('renders denied state even on public route when access was rejected', () => {
    expect(
      resolveGameChatViewState({
        isGameChatAccessDenied: true,
        canViewPublicChat: true,
      })
    ).toBe('denied');
  });

  it('keeps thread visible when route is allowed', () => {
    expect(
      resolveGameChatViewState({
        isGameChatAccessDenied: false,
        canViewPublicChat: true,
      })
    ).toBe('thread');
  });

  it('treats archived-thread 403 message loads as denied route state', () => {
    expect(
      shouldDenyArchivedGameChatRouteOnMessageError({
        status: 403,
        isGameChatArchived: true,
      })
    ).toBe(true);
  });

  it('does not treat active-thread 403s as archived denied state', () => {
    expect(
      shouldDenyArchivedGameChatRouteOnMessageError({
        status: 403,
        isGameChatArchived: false,
      })
    ).toBe(false);
  });
});
