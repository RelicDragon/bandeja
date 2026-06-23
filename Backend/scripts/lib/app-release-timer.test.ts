import {
  ReleaseProgressTimer,
  formatReleaseElapsed,
} from './app-release-timer';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(formatReleaseElapsed(0) === '0s', 'zero ms');
assert(formatReleaseElapsed(999) === '0s', 'sub-second rounds down');
assert(formatReleaseElapsed(45_000) === '45s', 'seconds only');
assert(formatReleaseElapsed(125_000) === '2m 5s', 'minutes and seconds');
assert(formatReleaseElapsed(3_725_000) === '1h 2m 5s', 'hours minutes seconds');

const originalNow = Date.now;
Date.now = () => 10_000;
try {
  const timer = new ReleaseProgressTimer(5_000);
  assert(timer.formatTitle('Build') === 'Build (step 0s · total 5s)', 'title without active step');
  assert(timer.totalElapsedLabel === '5s', 'total elapsed label');

  const task = { title: 'Upload Android AAB to Google Play' };
  const stop = timer.trackStep(task, 'Upload Android AAB to Google Play');
  assert(task.title === 'Upload Android AAB to Google Play (step 0s · total 5s)', 'tracked task title');
  Date.now = () => 13_000;
  stop();
  assert(
    task.title === 'Upload Android AAB to Google Play · step 3s',
    'completed row shows step duration only',
  );
} finally {
  Date.now = originalNow;
}

console.log('app-release-timer tests: OK');
