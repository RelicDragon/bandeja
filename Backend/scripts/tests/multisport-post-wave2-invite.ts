/**
 * P-W3-INVITE — invite push/Telegram copy uses game sport for sender level.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sport } from '@prisma/client';
import {
  formatInviteSenderLevelLine,
  formatInviteSenderNameWithLevel,
} from '../../src/services/shared/notificationSport';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const padelRatedSender = {
  sportProfiles: [
    { sport: Sport.PADEL, level: 3.8, gamesPlayed: 40 },
    { sport: Sport.TENNIS, level: 3.1, gamesPlayed: 5 },
  ],
};

const tennisOnlySender = {
  sportProfiles: [{ sport: Sport.TENNIS, level: 2.5, gamesPlayed: 2 }],
};

const padelLine = formatInviteSenderLevelLine(padelRatedSender, Sport.PADEL, 'en');
assert(padelLine === '3.8', `padel game shows padel level only (${padelLine})`);

const tennisDual = formatInviteSenderLevelLine(padelRatedSender, Sport.TENNIS, 'en');
assert(
  tennisDual === 'Padel 3.8 · Tennis 3.1',
  `tennis game dual line (${tennisDual})`,
);

const tennisSingle = formatInviteSenderLevelLine(tennisOnlySender, Sport.TENNIS, 'en');
assert(tennisSingle === 'Tennis 2.5', `tennis-only sender (${tennisSingle})`);

const badmintonLabeled = formatInviteSenderLevelLine(padelRatedSender, Sport.BADMINTON, 'en');
assert(
  badmintonLabeled === 'Padel 3.8 · Badminton 1.0',
  `non-padel default snapshot + rated padel dual (${badmintonLabeled})`,
);

const namePadel = formatInviteSenderNameWithLevel(padelRatedSender, 'Alex', Sport.PADEL, 'en');
assert(namePadel === 'Alex (3.8)', `name + padel level (${namePadel})`);

const nameTennis = formatInviteSenderNameWithLevel(padelRatedSender, 'Alex', Sport.TENNIS, 'en');
assert(
  nameTennis === 'Alex (Padel 3.8 · Tennis 3.1)',
  `name + dual level (${nameTennis})`,
);

const backendRoot = join(__dirname, '..', '..');
const readSrc = (rel: string) => readFileSync(join(backendRoot, 'src', rel), 'utf8');

for (const rel of [
  'services/push/notifications/invite-push.notification.ts',
  'services/telegram/notifications/invite.notification.ts',
]) {
  const src = readSrc(rel);
  assert(src.includes('formatInviteSenderNameWithLevel'), `${rel} uses sport-aware sender level`);
  assert(src.includes('invite.game.sport'), `${rel} passes game sport`);
}

const participantSrc = readSrc('services/game/participant.service.ts');
assert(
  participantSrc.includes('sportProfiles: participant.invitedByUser?.sportProfiles'),
  'sendInvite keeps sportProfiles on sender for notifications',
);

console.log('ok: multisport post-wave2 invite (P-W3-INVITE)');
