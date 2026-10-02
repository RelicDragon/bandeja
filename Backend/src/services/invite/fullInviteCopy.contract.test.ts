import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { t } from '../../utils/translations';

const pushSrc = readFileSync(join(__dirname, '../push/notifications/invite-push.notification.ts'), 'utf8');
const telegramSrc = readFileSync(join(__dirname, '../telegram/notifications/invite.notification.ts'), 'utf8');
const telegramAcceptSrc = readFileSync(join(__dirname, '../telegram/invite.service.ts'), 'utf8');
const slotOpenSrc = readFileSync(join(__dirname, './pendingInviteSlotOpen.service.ts'), 'utf8');

// A full-game invite says so and offers the waitlist on both channels.
assert.match(pushSrc, /isInvitePlaySlotFull\(invite\)/);
assert.match(pushSrc, /full \? 'telegram\.joinWaitlist' : 'telegram\.acceptInvite'/);
assert.match(pushSrc, /telegram\.inviteFullForNow/);
assert.match(telegramSrc, /isInvitePlaySlotFull\(invite\)/);
assert.match(telegramSrc, /full \? 'telegram\.joinWaitlist' : 'telegram\.acceptInvite'/);
// The re-send after a seat frees up reads as "a spot opened", not a second fresh invite.
assert.match(slotOpenSrc, /createInvitePushNotification\(invite, \{ spotOpened: true \}\)/);
assert.match(pushSrc, /telegram\.inviteSpotOpenedTitle/);
// Telegram accept on a full game reports the waitlist, not "accepted".
assert.match(telegramAcceptSrc, /games\.addedToJoinQueue' \? 'telegram\.inviteQueued'/);

const keys = [
  'telegram.inviteFullForNow',
  'telegram.joinWaitlist',
  'telegram.inviteQueued',
  'telegram.inviteSpotOpenedTitle',
];
for (const lang of ['en', 'ru', 'sr', 'es', 'cs', 'ar', 'zh', 'id', 'hi', 'th', 'ja']) {
  for (const key of keys) {
    const value = t(key, lang);
    assert.notEqual(value, key, `${lang} is missing ${key}`);
    if (lang !== 'en') assert.notEqual(value, t(key, 'en'), `${lang} falls back to English for ${key}`);
  }
}

console.log('ok: fullInviteCopy.contract.test.ts');
