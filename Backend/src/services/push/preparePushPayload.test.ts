import assert from 'node:assert/strict';
import { NotificationType } from '../../types/notifications.types';
import { preparePushPayloadForRecipient } from './preparePushPayload';

void (async () => {
  const payload = await preparePushPayloadForRecipient('user-1', {
    type: NotificationType.FOLLOWED_USER_PLAY_INTENT,
    title: 'A friend wants to play',
    body: 'Tap to join',
    data: { playIntentId: 'intent-1' },
    actions: [
      {
        id: 'play-too',
        title: 'I want to play too',
        action: 'play-too',
      },
    ],
  });

  assert.equal(payload.threadId, 'play-intent');
  assert.equal(payload.category, NotificationType.FOLLOWED_USER_PLAY_INTENT);
  assert.equal(payload.data?.playTooActionTitle, 'I want to play too');

  for (const type of [
    NotificationType.PLAY_INTENT_MATCH,
    NotificationType.GAME_MATCHES_INTENT,
    NotificationType.INTENT_PLAYERS_FOR_GAME,
  ]) {
    const grouped = await preparePushPayloadForRecipient('user-1', {
      type,
      title: 'Play intent',
      body: 'Update',
      data: {},
    });
    assert.equal(grouped.threadId, 'play-intent');
  }
  console.log('preparePushPayload.test.ts: ok');
})();
