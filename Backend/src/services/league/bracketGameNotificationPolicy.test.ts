import { PlayoffFormat } from '@prisma/client';
import { shouldSendBracketGameAssignedNotification } from './bracketGameNotificationPolicy';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(
  !shouldSendBracketGameAssignedNotification({
    timeIsSet: false,
    leagueRound: { playoffFormat: PlayoffFormat.BRACKET },
  }),
  'ENG-PUSH-2: skip when timeIsSet is false'
);

assert(
  !shouldSendBracketGameAssignedNotification({
    timeIsSet: true,
    leagueRound: { playoffFormat: PlayoffFormat.SESSION },
  }),
  'skip non-bracket playoff format'
);

assert(
  shouldSendBracketGameAssignedNotification({
    timeIsSet: true,
    leagueRound: { playoffFormat: PlayoffFormat.BRACKET },
  }),
  'notify when bracket game has scheduled time'
);

console.log('ok: bracketGameNotificationPolicy.test.ts');
