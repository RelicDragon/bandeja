import assert from 'node:assert/strict';
import {
  canSendGameMatchNotification,
  GAME_MATCH_NOTIFICATION_COOLDOWN_MS,
  GAME_MATCH_NOTIFICATION_WINDOW_MS,
} from './playIntentNotificationBudget';

const now = new Date('2026-07-30T12:00:00.000Z');
const ago = (milliseconds: number) =>
  new Date(now.getTime() - milliseconds);

assert.equal(canSendGameMatchNotification([], 'game:new', now), true);
assert.equal(
  canSendGameMatchNotification(
    [{ eventKey: 'game:same', createdAt: ago(GAME_MATCH_NOTIFICATION_WINDOW_MS) }],
    'game:same',
    now,
  ),
  false,
);
assert.equal(
  canSendGameMatchNotification(
    [
      {
        eventKey: 'game:recent',
        createdAt: ago(GAME_MATCH_NOTIFICATION_COOLDOWN_MS - 1),
      },
    ],
    'game:new',
    now,
  ),
  false,
);
assert.equal(
  canSendGameMatchNotification(
    [
      { eventKey: 'game:1', createdAt: ago(5 * 60 * 60 * 1000) },
      { eventKey: 'game:2', createdAt: ago(3 * 60 * 60 * 1000) },
      { eventKey: 'game:3', createdAt: ago(2 * 60 * 60 * 1000) },
    ],
    'game:new',
    now,
  ),
  false,
);
assert.equal(
  canSendGameMatchNotification(
    [
      {
        eventKey: 'game:old',
        createdAt: ago(GAME_MATCH_NOTIFICATION_WINDOW_MS + 1),
      },
    ],
    'game:new',
    now,
  ),
  true,
);

console.log('playIntentNotificationBudget.test.ts: ok');
