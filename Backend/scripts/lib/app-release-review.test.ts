import { buildReleaseNotes } from './app-release-notes';
import {
  approveStoreReviews,
  androidReviewNeedsApproval,
  iosReviewNeedsApproval,
  mergeStoreReviewSnapshot,
} from './app-release-review';
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
  targetPlatform: 'android',
  current: { version: '0.97.31', build: 213 },
  planned: { version: '0.97.32', build: 214 },
  notes: buildReleaseNotes('Reliable review replacement', 'custom'),
  artifacts: {},
  store: { androidTrack: 'production' },
  uploads: {},
  iosAppStoreConnect: {},
  reviewGuard: {
    android: { inReview: true, versionCode: '212', versionCodes: ['212'] },
    androidReplacementApprovedFingerprint: 'release:|version-codes:212',
  },
};

const noReview = mergeStoreReviewSnapshot(
  baseSession,
  { android: { inReview: false } },
  '2026-08-23T12:00:00.000Z',
);
const differentReview = mergeStoreReviewSnapshot(
  noReview,
  { android: { inReview: true, versionCode: '213' } },
  '2026-08-23T12:10:00.000Z',
);

assert(
  androidReviewNeedsApproval(differentReview),
  'a different Google Play review invalidates an earlier replacement approval',
);

const sameReview = mergeStoreReviewSnapshot(
  baseSession,
  { android: { inReview: true, versionCode: '212', versionCodes: ['212'] } },
  '2026-08-23T12:05:00.000Z',
);
assert(!androidReviewNeedsApproval(sameReview), 'the exact approved Google review stays approved');

const expandedReview = mergeStoreReviewSnapshot(
  baseSession,
  { android: { inReview: true, versionCode: '213', versionCodes: ['212', '213'] } },
  '2026-08-23T12:06:00.000Z',
);
assert(
  androidReviewNeedsApproval(expandedReview),
  'adding an artifact to a Google review invalidates earlier approval',
);

const bothConflicts: ReleaseSession = {
  ...baseSession,
  targetPlatform: 'both',
  reviewGuard: {
    android: { inReview: true, versionCode: '212' },
    ios: {
      inReview: true,
      version: '0.97.30',
      state: 'WAITING_FOR_REVIEW',
      submissionId: 'ios-old',
    },
  },
};
const iosOnly = approveStoreReviews(bothConflicts, 'ios', { narrowTarget: true });
assert(iosOnly.targetPlatform === 'ios', 'Apple-only approval narrows a two-store release to iOS');
assert(!iosReviewNeedsApproval(iosOnly), 'approved App Store submission no longer needs approval');
assert(
  androidReviewNeedsApproval(iosOnly),
  'unselected Google review remains unapproved even after narrowing target',
);

const singleConflictApproval = approveStoreReviews(bothConflicts, 'android');
assert(
  singleConflictApproval.targetPlatform === 'both',
  'approving one detected conflict does not narrow an otherwise unblocked two-store release',
);

const changedIos = mergeStoreReviewSnapshot(
  iosOnly,
  {
    ios: {
      inReview: true,
      state: 'IN_REVIEW',
      submissionId: 'ios-new',
    },
  },
  '2026-08-23T12:20:00.000Z',
);
assert(iosReviewNeedsApproval(changedIos), 'a changed App Store submission needs fresh approval');

const cancelingIos = mergeStoreReviewSnapshot(
  changedIos,
  {
    ios: {
      inReview: true,
      state: 'CANCELING',
      submissionId: 'ios-new',
    },
  },
  '2026-08-23T12:21:00.000Z',
);
assert(!iosReviewNeedsApproval(cancelingIos), 'an already-canceling App Store review needs waiting, not approval');

console.log('app-release-review tests: OK');
