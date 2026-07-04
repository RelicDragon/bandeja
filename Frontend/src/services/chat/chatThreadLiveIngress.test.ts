import { describe, expect, it } from 'vitest';
import { canUseLiveThreadIngress } from './chatThreadLiveIngress';

describe('canUseLiveThreadIngress', () => {
  it('keeps archived game-thread reopen frozen', () => {
    expect(
      canUseLiveThreadIngress({
        contextType: 'GAME',
        isLoadingContext: false,
        isGameChatArchived: true,
        isGameChatAccessDenied: false,
      })
    ).toBe(false);
  });

  it('blocks live game ingress until context resolves', () => {
    expect(
      canUseLiveThreadIngress({
        contextType: 'GAME',
        isLoadingContext: true,
        isGameChatArchived: false,
        isGameChatAccessDenied: false,
      })
    ).toBe(false);
  });

  it('blocks denied archived-game route ingress', () => {
    expect(
      canUseLiveThreadIngress({
        contextType: 'GAME',
        isLoadingContext: false,
        isGameChatArchived: false,
        isGameChatAccessDenied: true,
      })
    ).toBe(false);
  });

  it('leaves non-game threads unchanged', () => {
    expect(
      canUseLiveThreadIngress({
        contextType: 'USER',
        isLoadingContext: true,
        isGameChatArchived: false,
        isGameChatAccessDenied: false,
      })
    ).toBe(true);
  });
});
