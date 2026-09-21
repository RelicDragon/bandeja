import assert from 'node:assert/strict';
import { NotificationType } from '../../types/notifications.types';
import { buildFcmMessage, buildFcmMulticastMessage } from './fcm.service';

function testFcmIncludesAndroidImageWhenPreviewPresent(): void {
  const previewUrl = 'https://d1afylun4w6qxe.cloudfront.net/uploads/chat/thumbnails/photo_thumb.jpg';
  const message = buildFcmMessage('token-1', {
    type: NotificationType.USER_CHAT,
    title: 'Sender',
    body: '📷 Photo',
    data: {
      chatContextType: 'USER',
      contextId: 'chat-1',
      messageId: 'msg-1',
      previewImageUrl: previewUrl,
      previewMediaType: 'image',
      mediaCount: 1,
    },
  });

  assert.equal(message.android?.notification?.imageUrl, previewUrl);
  assert.equal(message.data?.previewImageUrl, previewUrl);
}

function testFcmOmitsAndroidImageWithoutPreview(): void {
  const message = buildFcmMessage('token-2', {
    type: NotificationType.USER_CHAT,
    title: 'Sender',
    body: 'Hello',
    data: {
      chatContextType: 'USER',
      contextId: 'chat-2',
      messageId: 'msg-2',
    },
  });

  assert.equal(message.android?.notification?.imageUrl, undefined);
}

function testFcmIncludesUnreadBadgeInData(): void {
  const message = buildFcmMessage('token-3', {
    type: NotificationType.USER_CHAT,
    title: 'Sender',
    body: 'Hello',
    badge: 12,
    data: {
      chatContextType: 'USER',
      contextId: 'chat-3',
      messageId: 'msg-3',
      unreadBadgeCount: 12,
    },
  });

  assert.equal(message.data?.unreadBadgeCount, '12');
}

function testFcmCollapsesOutboxRetries(): void {
  const message = buildFcmMessage('token-4', {
    type: NotificationType.FOLLOWED_USER_PLAY_INTENT,
    title: 'A friend wants to play',
    body: 'Tap to join',
    data: {
      playIntentId: 'intent-1',
      deliveryKey: 'FOLLOWED_USER_PLAY_INTENT:intent-1',
    },
  });

  assert.equal(message.android?.collapseKey?.length, 64);
  assert.equal(
    message.data?.deliveryKey,
    'FOLLOWED_USER_PLAY_INTENT:intent-1',
  );
  assert.equal(message.data?.nativeHandler, 'play_intent_actions');
  assert.equal(message.notification, undefined);
}

function testFcmSendsNewGameDataOnly(): void {
  const message = buildFcmMessage('token-5', {
    type: NotificationType.NEW_GAME,
    title: 'New game created',
    body: 'Tue 18:00 Court 1',
    data: {
      gameId: 'game-1',
      shortDayOfWeek: 'Tue',
    },
  });

  assert.equal(message.notification, undefined);
  assert.equal(message.data?.type, 'NEW_GAME');
  assert.equal(message.data?.gameId, 'game-1');
  assert.equal(message.data?.title, 'New game created');
}

/**
 * PRD 346 — this data map is the whole contract the Android shade handler
 * (`AttendancePushData.java`) reads. It has no i18n of its own, so both button
 * titles and both acknowledgements must travel with the reminder.
 */
function testFcmCarriesAttendanceShadeContract(): void {
  const message = buildFcmMessage('token-6', {
    type: NotificationType.GAME_REMINDER,
    title: 'Tomorrow 19:00',
    body: 'Padel Centar, court 3',
    data: {
      gameId: 'game-1',
      shortDayOfWeek: 'Tue',
      attendanceActionToken: 'confirm-token',
      attendanceUnsureActionToken: 'unsure-token',
      confirmActionTitle: "I'm coming",
      unsureActionTitle: 'Not sure yet',
      attendanceConfirmedAck: 'Seat confirmed 👍',
      attendanceUnsureAck: 'Noted. You can confirm later.',
    },
  });

  assert.equal(message.data?.nativeHandler, 'attendance_actions');
  assert.equal(message.data?.attendanceActionToken, 'confirm-token');
  assert.equal(message.data?.attendanceUnsureActionToken, 'unsure-token');
  assert.equal(message.data?.confirmActionTitle, "I'm coming");
  assert.equal(message.data?.unsureActionTitle, 'Not sure yet');
  assert.equal(message.data?.attendanceConfirmedAck, 'Seat confirmed 👍');
  assert.equal(message.data?.attendanceUnsureAck, 'Noted. You can confirm later.');
  assert.equal(message.notification, undefined);
}

/** A reminder without the tokens must not reach the attendance shade handler. */
function testFcmLeavesAPlainReminderAlone(): void {
  const message = buildFcmMessage('token-7', {
    type: NotificationType.GAME_REMINDER,
    title: 'Tomorrow 19:00',
    body: 'Padel Centar, court 3',
    data: {
      gameId: 'game-1',
      shortDayOfWeek: 'Tue',
    },
  });

  assert.equal(message.data?.nativeHandler, undefined);
}

function testFcmBuildsOneMulticastMessage(): void {
  const message = buildFcmMulticastMessage(['token-1', 'token-2'], {
    type: NotificationType.FOLLOWED_USER_PLAY_INTENT,
    title: 'A friend wants to play',
    body: 'Tap to join',
    data: {
      playIntentId: 'intent-1',
      playTooActionTitle: 'I want to play too',
    },
  });

  assert.deepEqual(message.tokens, ['token-1', 'token-2']);
  assert.equal(message.data?.playTooActionTitle, 'I want to play too');
  assert.equal('token' in message, false);
}

void (async () => {
  testFcmIncludesAndroidImageWhenPreviewPresent();
  testFcmOmitsAndroidImageWithoutPreview();
  testFcmIncludesUnreadBadgeInData();
  testFcmCollapsesOutboxRetries();
  testFcmSendsNewGameDataOnly();
  testFcmCarriesAttendanceShadeContract();
  testFcmLeavesAPlainReminderAlone();
  testFcmBuildsOneMulticastMessage();
  console.log('fcm.service.test.ts: ok');
})();
