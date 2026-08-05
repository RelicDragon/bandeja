import assert from 'node:assert/strict';
import { NotificationType } from '../../types/notifications.types';
import { sendPlayIntentTelegramNotification } from '../telegram/notifications/play-intent.notification';

/**
 * The play-intent telegram send must distinguish permanent rejections (never
 * going to succeed on retry) from transient failures. This unit test covers
 * the pure no-telegramId short-circuit — the one branch that needs no grammy
 * API or DB. The DB/guard/bot-null paths are covered by the integration test.
 */

// `api` is only reached when telegramId is present, so a minimal stub suffices.
const stubApi = {} as never;

const payload = {
  type: NotificationType.FOLLOWED_USER_PLAY_INTENT,
  title: 'A friend wants to play',
  body: 'Open the request',
};

async function run() {
  // No chat id linked → permanent (retrying cannot fix a missing telegramId).
  const noChatId = await sendPlayIntentTelegramNotification(
    stubApi,
    'user-1',
    '',
    payload,
  );
  assert.equal(noChatId.delivered, false);
  assert.equal(noChatId.permanent, true);

  const nullishChatId = await sendPlayIntentTelegramNotification(
    stubApi,
    'user-1',
    undefined as unknown as string,
    payload,
  );
  assert.equal(nullishChatId.delivered, false);
  assert.equal(nullishChatId.permanent, true);

  console.log('✓ playIntentPermanentDelivery: no-telegramId classified permanent');
}

void run();
