import { Sport } from '@prisma/client';
import { getShortDayOfWeek } from '../../src/services/user-timezone.service';
import {
  appendTelegramGameScheduleExtras,
  buildGameReminderTitle,
  collectTelegramGameScheduleExtras,
  formatMatchFormatLabel,
  formatSportLabel,
  formatSportPrefix,
  shouldPrefixSport,
  withOptionalSportPrefix,
} from '../../src/services/shared/notificationSport';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(!shouldPrefixSport(Sport.PADEL, Sport.PADEL), 'padel game + padel primary: no prefix');
assert(!shouldPrefixSport(Sport.PADEL, null), 'padel game + null primary defaults padel');
assert(shouldPrefixSport(Sport.TENNIS, Sport.PADEL), 'tennis game + padel primary: prefix');
assert(shouldPrefixSport(Sport.TABLE_TENNIS, Sport.TENNIS), 'tt game + tennis primary: prefix');

assert(formatSportPrefix(Sport.PADEL, Sport.PADEL, 'en') === '', 'prefix empty when sports match');
assert(formatSportPrefix(Sport.TENNIS, Sport.PADEL, 'en') === 'Tennis:', 'en tennis prefix');
assert(formatSportLabel(Sport.TABLE_TENNIS, 'en') === 'Table tennis', 'en table tennis label');
assert(formatSportLabel(Sport.SQUASH, 'ru') === 'Сквош', 'ru squash label');

const padelReminder = buildGameReminderTitle('GAME', 2, Sport.PADEL, Sport.PADEL, 'en');
assert(
  padelReminder === 'Reminder: Your game starts in 2 hours',
  `padel-only reminder unchanged (${padelReminder})`,
);

const tennisReminder = buildGameReminderTitle('GAME', 2, Sport.TENNIS, Sport.PADEL, 'en');
assert(
  tennisReminder.startsWith('Tennis: Reminder:'),
  `tennis reminder prefixed (${tennisReminder})`,
);

const inviteTitle = withOptionalSportPrefix('New Invite', Sport.BADMINTON, Sport.PADEL, 'en');
assert(inviteTitle === 'Badminton: New Invite', `invite title prefixed (${inviteTitle})`);

const leagueAssign = withOptionalSportPrefix(
  'You were assigned to a league game',
  Sport.PICKLEBALL,
  Sport.PADEL,
  'en',
);
assert(
  leagueAssign.startsWith('Pickleball: You were assigned'),
  `league assign prefixed (${leagueAssign})`,
);

assert(formatMatchFormatLabel(4, Sport.PADEL, 'en') === null, 'padel default 2v2 hidden');
assert(formatMatchFormatLabel(2, Sport.PADEL, 'en') === '1v1', 'padel singles shown');
assert(formatMatchFormatLabel(2, Sport.TENNIS, 'en') === null, 'tennis default 1v1 hidden');
assert(formatMatchFormatLabel(4, Sport.TENNIS, 'en') === '2v2', 'tennis doubles shown');

const padelExtras = collectTelegramGameScheduleExtras(
  { sport: Sport.PADEL, playersPerMatch: 4 },
  Sport.PADEL,
  'en',
);
assert(padelExtras.length === 0, 'no schedule extras when sport and format are default');

const tennisSinglesExtras = collectTelegramGameScheduleExtras(
  { sport: Sport.TENNIS, playersPerMatch: 2 },
  Sport.PADEL,
  'en',
);
assert(
  tennisSinglesExtras.join(' · ') === 'Tennis',
  `tennis-only extras (${tennisSinglesExtras.join(' · ')})`,
);

const padelSinglesLine = appendTelegramGameScheduleExtras(
  '📍 Club',
  { sport: Sport.PADEL, playersPerMatch: 2 },
  Sport.PADEL,
  'en',
);
assert(padelSinglesLine === '📍 Club · 1v1', `padel singles line (${padelSinglesLine})`);

(async () => {
  const wedEn = await getShortDayOfWeek('2026-05-20T12:00:00Z', 'UTC', 'en');
  assert(wedEn === 'Wed', `en short day (${wedEn})`);
  const wedRu = await getShortDayOfWeek('2026-05-20T12:00:00Z', 'UTC', 'ru');
  assert(wedRu === 'Ср', `ru short day (${wedRu})`);
  const wedCs = await getShortDayOfWeek('2026-05-20T12:00:00Z', 'UTC', 'cs');
  assert(wedCs === 'St', `cs short day (${wedCs})`);
  console.log('ok: multisport phase 4 notifications (sport prefix copy)');
})();
