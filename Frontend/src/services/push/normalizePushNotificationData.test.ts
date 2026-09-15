import { describe, expect, it } from 'vitest';
import { normalizePushNotificationData } from './normalizePushNotificationData';
import { resolveNotificationTapRoute } from '@/utils/pushNotificationBracketRouting.util';

describe('normalizePushNotificationData', () => {
  it('keeps iOS nested NEW_GAME gameId', () => {
    const normalized = normalizePushNotificationData({
      type: 'NEW_GAME',
      data: { gameId: 'game-ios', shortDayOfWeek: 'Tue' },
    });
    expect(normalized).toEqual({
      type: 'NEW_GAME',
      data: { gameId: 'game-ios', shortDayOfWeek: 'Tue' },
    });
    expect(resolveNotificationTapRoute(normalized!.type, normalized!.data)).toEqual({
      kind: 'game',
      gameId: 'game-ios',
    });
  });

  it('keeps Android flattened NEW_GAME gameId', () => {
    const normalized = normalizePushNotificationData({
      type: 'NEW_GAME',
      gameId: 'game-android',
      title: 'New game created',
      body: 'Tue 18:00',
      shortDayOfWeek: 'Tue',
    });
    expect(normalized?.type).toBe('NEW_GAME');
    expect(normalized?.data.gameId).toBe('game-android');
    expect(resolveNotificationTapRoute(normalized!.type, normalized!.data)).toEqual({
      kind: 'game',
      gameId: 'game-android',
    });
  });

  it('parses stringified nested data used by some FCM taps', () => {
    const normalized = normalizePushNotificationData({
      type: 'NEW_GAME',
      data: JSON.stringify({ gameId: 'game-json' }),
    });
    expect(normalized?.data.gameId).toBe('game-json');
    expect(resolveNotificationTapRoute(normalized!.type, normalized!.data)).toEqual({
      kind: 'game',
      gameId: 'game-json',
    });
  });

  it('unwraps double-nested Capacitor data envelopes', () => {
    const normalized = normalizePushNotificationData({
      data: { type: 'NEW_GAME', data: { gameId: 'game-wrap' } },
    });
    expect(normalized).toEqual({
      type: 'NEW_GAME',
      data: { gameId: 'game-wrap' },
    });
  });

  it('returns null without a type', () => {
    expect(normalizePushNotificationData({ gameId: 'game-1' })).toBeNull();
    expect(normalizePushNotificationData(null)).toBeNull();
  });
});
