import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  calendarDateBounds,
  endOfCalendarDate,
  InvalidCalendarDateError,
  startOfCalendarDate,
} from './calendarDateBounds';

{
  const start = startOfCalendarDate('2026-07-23', 'Europe/Belgrade');
  const end = endOfCalendarDate('2026-07-23', 'Europe/Belgrade');
  assert.equal(start.toISOString(), '2026-07-22T22:00:00.000Z');
  assert.equal(end.toISOString(), '2026-07-23T21:59:59.999Z');
}

{
  const range = calendarDateBounds('2026-07-23', '2026-07-23', 'Europe/Belgrade');
  assert.equal(range.gte?.toISOString(), '2026-07-22T22:00:00.000Z');
  assert.equal(range.lte?.toISOString(), '2026-07-23T21:59:59.999Z');
  const game = new Date('2026-07-23T16:00:00.000Z');
  assert.ok(game >= range.gte! && game <= range.lte!);
}

{
  const utc = calendarDateBounds('2026-07-23', '2026-07-23', 'UTC');
  assert.equal(utc.gte?.toISOString(), '2026-07-23T00:00:00.000Z');
  assert.equal(utc.lte?.toISOString(), '2026-07-23T23:59:59.999Z');
}

{
  assert.throws(() => startOfCalendarDate('nope', 'UTC'), InvalidCalendarDateError);
  assert.throws(() => startOfCalendarDate('2026-02-31', 'UTC'), InvalidCalendarDateError);
  assert.throws(() => startOfCalendarDate('2026-13-01', 'UTC'), InvalidCalendarDateError);
}

// Host process TZ must not change Belgrade wall-clock → UTC conversion.
{
  const backendRoot = path.join(__dirname, '../../..');
  for (const hostTz of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        `
          const { fromZonedTime } = require('date-fns-tz');
          const start = fromZonedTime(new Date(2026, 6, 23, 0, 0, 0, 0), 'Europe/Belgrade');
          const end = fromZonedTime(new Date(2026, 6, 23, 23, 59, 59, 999), 'Europe/Belgrade');
          if (start.toISOString() !== '2026-07-22T22:00:00.000Z') process.exit(2);
          if (end.toISOString() !== '2026-07-23T21:59:59.999Z') process.exit(3);
        `,
      ],
      {
        cwd: backendRoot,
        encoding: 'utf8',
        env: { ...process.env, TZ: hostTz },
      },
    );
    assert.equal(result.status, 0, `host TZ=${hostTz}: ${result.stderr || result.stdout}`);
  }
}

console.log('calendarDateBounds.test.ts: ok');
