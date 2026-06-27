import { getSessionPhase, storeConfigComplete } from './app-release-planner';
import { buildReleaseNotes } from './app-release-notes';
import type { ReleaseSession } from './app-release-session';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const baseSession: ReleaseSession = {
  baselineSha: 'a'.repeat(40),
  headSha: 'b'.repeat(40),
  current: { version: '0.96.40', build: 154 },
  planned: { version: '0.96.41', build: 155 },
  notes: null,
  artifacts: {},
  store: {},
  uploads: {},
  iosAppStoreConnect: {},
};

assert(getSessionPhase(baseSession) === 'planning', 'planning without notes');

const withNotes = {
  ...baseSession,
  notes: buildReleaseNotes('• Notes', 'custom'),
};
assert(getSessionPhase(withNotes) === 'ready-to-apply', 'ready-to-apply after notes');

assert(!storeConfigComplete({}), 'store config incomplete by default');
assert(
  storeConfigComplete({ androidTrack: 'internal', iosSubmitForReview: false }),
  'store config complete with track and ios mode',
);
assert(
  !storeConfigComplete({ androidTrack: 'internal' }),
  'store config incomplete without ios mode',
);

console.log('app-release-finalize tests: OK');
