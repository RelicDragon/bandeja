import { evaluateBroadcastDispatch } from './notificationDispatchGuard';
import { isProdDatabaseUrl } from './dbEnvironment';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(
  isProdDatabaseUrl('postgresql://u:p@back.bandeja.com:5432/padelpulse_dev'),
  'prod host in DB URL should be detected',
);
assert(
  !isProdDatabaseUrl('postgresql://postgres:postgres@localhost:5432/padelpulse_dev'),
  'local dev DB URL should not be prod-like',
);

const prevNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'development';

const broadcast = evaluateBroadcastDispatch('new-game');
assert(!broadcast.allowed, 'dev broadcasts should be blocked by default');
assert(broadcast.reason === 'dev-broadcast-blocked', 'expected dev-broadcast-blocked reason');

process.env.NODE_ENV = prevNodeEnv;

console.log('notificationDispatchGuard.test.ts: ok');
