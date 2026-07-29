import { describe, expect, it } from 'vitest';
import { resolveSharedPlayIntentProgress } from './sharedPlayIntentProgress';

describe('resolveSharedPlayIntentProgress', () => {
  it('keeps joining feedback visible until the lobby request is consumed', () => {
    expect(
      resolveSharedPlayIntentProgress({
        loading: false,
        joining: false,
        hasDialogIntent: false,
        joinedSport: true,
        lobbyRequested: true,
      }),
    ).toBe('joining');
  });

  it('clears joining feedback after the lobby opens', () => {
    expect(
      resolveSharedPlayIntentProgress({
        loading: false,
        joining: false,
        hasDialogIntent: false,
        joinedSport: true,
        lobbyRequested: false,
      }),
    ).toBeNull();
  });
});
