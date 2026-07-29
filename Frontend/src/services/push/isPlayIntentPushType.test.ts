import { describe, expect, it } from 'vitest';
import { isPlayIntentPushType } from './isPlayIntentPushType';

describe('isPlayIntentPushType', () => {
  it.each([
    'PLAY_INTENT_MATCH',
    'GAME_MATCHES_INTENT',
    'INTENT_PLAYERS_FOR_GAME',
    'FOLLOWED_USER_PLAY_INTENT',
  ])('refreshes play-intent state for %s', (type) => {
    expect(isPlayIntentPushType(type)).toBe(true);
  });

  it('does not refresh play-intent state for unrelated pushes', () => {
    expect(isPlayIntentPushType('GAME_CHAT')).toBe(false);
    expect(isPlayIntentPushType(undefined)).toBe(false);
  });
});
