import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildReleaseNotes, derivePlayShortDescription } from './app-release-notes';
import {
  PLAY_TRACKS,
  ReleaseUploadError,
  isAndroidAlreadyUploadedError,
  isGoogleReviewConflictError,
  isIosReviewConflictError,
  parseIosAppStoreConnectState,
  parsePendingStoreReview,
  prepareUploadMetadata,
  resolvePlayTrack,
  resolvePlayWhatsNewText,
  runStoreReviewCheckPreflight,
  runStoreVerificationPreflight,
  runUploadPreflight,
  storeReviewCheckPlatforms,
  tailUploadLog,
} from './app-release-upload';
import { parseStoreVersionOutput } from './app-release-store-version';
import type { ReleaseSession } from './app-release-session';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function withoutStoreCredentials(fn: () => void): void {
  const keys = [
    'PLAY_STORE_JSON_KEY_PATH',
    'GOOGLE_PLAY_JSON_KEY',
    'ASC_KEY_ID',
    'ASC_ISSUER_ID',
    'ASC_KEY_PATH',
  ] as const;
  const previous = new Map<string, string | undefined>();
  for (const key of keys) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  try {
    fn();
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

const baseSession: ReleaseSession = {
  baselineSha: 'a'.repeat(40),
  headSha: 'b'.repeat(40),
  targetPlatform: 'both',
  current: { version: '0.96.40', build: 154 },
  planned: { version: '0.96.41', build: 155 },
  storeVersions: {
    android: { version: '0.96.40', build: 154 },
    ios: { version: '0.96.40', build: 154 },
  },
  notes: buildReleaseNotes('• One improvement', 'custom', 'Short Play copy'),
  artifacts: {
    aab: path.join(os.tmpdir(), 'missing-aab.aab'),
    ipa: path.join(os.tmpdir(), 'missing-ipa.ipa'),
  },
  store: {
    androidTrack: 'internal',
    iosSubmitForReview: false,
  },
  uploads: {},
  iosAppStoreConnect: {},
  reviewGuard: {},
};

assert(PLAY_TRACKS.includes('internal'), 'PLAY_TRACKS includes internal');
assert(PLAY_TRACKS.includes('alpha'), 'PLAY_TRACKS includes alpha');
assert(PLAY_TRACKS.includes('production'), 'PLAY_TRACKS includes production');
assert(resolvePlayTrack('closed') === 'alpha', 'closed alias maps to alpha');
assert(resolvePlayTrack('alpha') === 'alpha', 'alpha track resolves');
assert(resolvePlayTrack('bogus') === null, 'invalid track rejected');
assert(
  isAndroidAlreadyUploadedError(
    new ReleaseUploadError(
      'Google Api Error: Invalid request',
      'APK specifies a version code that has already been used.',
    ),
  ),
  'detects already-uploaded Android version code',
);
assert(
  isGoogleReviewConflictError(
    new ReleaseUploadError(
      'Google Api Error: failed precondition',
      'reason: CHANGES_ALREADY_IN_REVIEW',
    ),
  ),
  'detects a late Google Play review conflict',
);
assert(
  isIosReviewConflictError(
    new ReleaseUploadError(
      'App Store upload blocked',
      'APP_RELEASE_IOS_REVIEW_CONFLICT:submission-new',
    ),
  ),
  'detects a late App Store review conflict',
);
const filteredTail = tailUploadLog(
  [
    "from /opt/homebrew/lib/ruby/gems/fastlane/lib/fastlane/runner.rb:229:in 'Dir.chdir'",
    "appStoreVersions with id 'caf298b5-d55b-430c-bb63-657bf3059a96' is not in valid state.",
    "The provided entity is missing a required attribute - You must provide a value for the attribute 'whatsNew' with this request",
    'App Store Connect selected build is 154; expected 155',
  ].join('\n'),
);
assert(filteredTail.includes('whatsNew'), 'upload tail keeps App Store Connect error');
assert(filteredTail.includes('selected build'), 'upload tail keeps verification error');
assert(
  !filteredTail.includes('Dir.chdir'),
  'upload tail hides Ruby stack noise when useful errors exist',
);
const parsedIosState = parseIosAppStoreConnectState(
  [
    'INFO APP_RELEASE_IOS_STATE_JSON:{"buildId":"build-1","lastObservedProcessingStatus":"PROCESSING"}',
    'APP_RELEASE_IOS_STATE_JSON:{"appStoreVersionId":"version-1","metadataUpdatedAt":"2026-06-28T12:00:00Z","submissionId":"submission-1"}',
  ].join('\n'),
);
assert(parsedIosState.buildId === 'build-1', 'parses iOS build id from Fastlane marker');
assert(
  parsedIosState.lastObservedProcessingStatus === 'PROCESSING',
  'parses iOS processing state from Fastlane marker',
);
assert(
  parsedIosState.appStoreVersionId === 'version-1',
  'merges iOS App Store version id from later marker',
);
assert(
  parsedIosState.submissionId === 'submission-1',
  'parses iOS submission id from Fastlane marker',
);
const parsedAndroidReview = parsePendingStoreReview(
  'INFO APP_RELEASE_REVIEW_STATE_JSON:{"platform":"android","inReview":true,"state":"IN_REVIEW","versionCode":"155","versionCodes":["154","155"]}',
  'android',
);
assert(parsedAndroidReview.inReview, 'parses a Google Play review conflict');
assert(parsedAndroidReview.versionCode === '155', 'parses reviewed Google Play version code');
assert(
  parsedAndroidReview.versionCodes?.join(',') === '154,155',
  'parses the complete reviewed Google Play artifact set',
);
const parsedIosReview = parsePendingStoreReview(
  'APP_RELEASE_REVIEW_STATE_JSON:{"platform":"ios","inReview":true,"state":"WAITING_FOR_REVIEW","version":"0.96.40","submissionId":"submission-old"}',
  'ios',
);
assert(parsedIosReview.version === '0.96.40', 'parses reviewed App Store version');
assert(
  parsedIosReview.submissionId === 'submission-old',
  'parses removable App Store submission id',
);

const parsedStoreVersion = parseStoreVersionOutput(
  'INFO APP_RELEASE_STORE_VERSION_JSON:{"platform":"ios","version":"0.97.35","build":217}',
  'ios',
);
assert(
  parsedStoreVersion.version === '0.97.35' && parsedStoreVersion.build === 217,
  'parses latest App Store version marker',
);

const playText = resolvePlayWhatsNewText(baseSession);
assert(playText === 'Short Play copy', 'resolvePlayWhatsNewText prefers short notes');

const tempAab = path.join(os.tmpdir(), 'app-release-upload-test.aab');
const tempIpa = path.join(os.tmpdir(), 'app-release-upload-test.ipa');
fs.writeFileSync(tempAab, 'aab');
fs.writeFileSync(tempIpa, 'ipa');

const sessionWithArtifacts = {
  ...baseSession,
  artifacts: { aab: tempAab, ipa: tempIpa },
};

const productionReviewSession: ReleaseSession = {
  ...sessionWithArtifacts,
  store: { androidTrack: 'production', iosSubmitForReview: true },
};
assert(
  storeReviewCheckPlatforms(productionReviewSession).join(',') === 'android,ios',
  'checks both stores when production and submit-for-review are selected',
);
assert(
  storeReviewCheckPlatforms({
    ...productionReviewSession,
    store: { androidTrack: 'internal', iosSubmitForReview: false },
  }).length === 0,
  'skips review checks for test track and prepare-without-submit',
);

const preflightMissing = runUploadPreflight({
  ...sessionWithArtifacts,
  store: {},
});
assert(!preflightMissing.ok, 'upload preflight fails without store config');
assert(
  preflightMissing.issues.some((issue) => issue.includes('Google Play track')),
  'upload preflight mentions Play track',
);

const iosOnlyPreflight = runUploadPreflight({
  ...sessionWithArtifacts,
  targetPlatform: 'ios',
  artifacts: { ipa: tempIpa },
  store: { iosSubmitForReview: false },
  uploads: {},
});
assert(
  !iosOnlyPreflight.issues.some((issue) => issue.includes('Android AAB')),
  'iOS-only preflight does not require AAB',
);
assert(
  !iosOnlyPreflight.issues.some((issue) => issue.includes('PLAY_STORE_JSON_KEY_PATH')),
  'iOS-only preflight does not require Play credentials',
);

const iosFinalizeOnlyPreflight = runUploadPreflight({
  ...sessionWithArtifacts,
  targetPlatform: 'ios',
  artifacts: {},
  store: { iosSubmitForReview: false },
  uploads: { iosBinary: true },
});
assert(
  !iosFinalizeOnlyPreflight.issues.some((issue) => issue.includes('iOS IPA')),
  'iOS finalize preflight does not require IPA after binary upload',
);

const iosVerifyOnlyPreflight = runUploadPreflight({
  ...sessionWithArtifacts,
  targetPlatform: 'ios',
  artifacts: {},
  store: { iosSubmitForReview: false },
  uploads: {
    iosBinary: true,
    iosBuildProcessed: true,
    iosStoreVersion: true,
  },
});
assert(
  !iosVerifyOnlyPreflight.issues.some((issue) => issue.includes('iOS IPA')),
  'iOS verification preflight does not require IPA after metadata update',
);

const androidOnlyPreflight = runUploadPreflight({
  ...sessionWithArtifacts,
  targetPlatform: 'android',
  artifacts: { aab: tempAab },
  store: { androidTrack: 'internal' },
  uploads: {},
});
assert(
  !androidOnlyPreflight.issues.some((issue) => issue.includes('iOS IPA')),
  'Android-only preflight does not require IPA',
);
assert(
  !androidOnlyPreflight.issues.some((issue) => issue.includes('ASC_KEY_ID')),
  'Android-only preflight does not require App Store credentials',
);
assert(
  !iosVerifyOnlyPreflight.issues.some((issue) => issue.includes('Google Play track')),
  'iOS verification preflight does not require Play track after Android upload',
);

const uploadedPreflight = runUploadPreflight({
  ...sessionWithArtifacts,
  artifacts: {},
  store: {},
  uploads: { android: true, ios: true },
});
assert(uploadedPreflight.ok, 'upload preflight passes when both uploads are complete');

withoutStoreCredentials(() => {
  const reviewCheckMissing = runStoreReviewCheckPreflight(productionReviewSession);
  assert(!reviewCheckMissing.ok, 'review check preflight requires store credentials');
  assert(
    reviewCheckMissing.issues.some((issue) => issue.includes('Google Play review state')),
    'review check preflight mentions Google credentials',
  );
  assert(
    reviewCheckMissing.issues.some((issue) => issue.includes('App Store review state')),
    'review check preflight mentions App Store credentials',
  );

  const storeVerificationMissing = runStoreVerificationPreflight({
    ...sessionWithArtifacts,
    targetPlatform: 'both',
    artifacts: {},
    uploads: { android: true, iosStoreVersion: true },
  });
  assert(!storeVerificationMissing.ok, 'store verification preflight requires credentials');
  assert(
    !storeVerificationMissing.issues.some((issue) => issue.includes('Android AAB')),
    'store verification preflight does not require Android artifact',
  );
  assert(
    !storeVerificationMissing.issues.some((issue) => issue.includes('iOS IPA')),
    'store verification preflight does not require iOS artifact',
  );
});

const unapprovedReviewPreflight = runUploadPreflight({
  ...sessionWithArtifacts,
  store: { androidTrack: 'production', iosSubmitForReview: true },
  reviewGuard: {
    android: { inReview: true },
    ios: { inReview: true, submissionId: 'submission-old' },
  },
});
assert(
  unapprovedReviewPreflight.issues.some((issue) => issue.includes('replacement was not approved')),
  'upload preflight blocks unapproved Google review replacement',
);
assert(
  unapprovedReviewPreflight.issues.some((issue) => issue.includes('removal was not approved')),
  'upload preflight blocks unapproved App Store review removal',
);

const storeVerificationComplete = runStoreVerificationPreflight({
  ...sessionWithArtifacts,
  artifacts: {},
  store: {},
  uploads: { androidStoreVerified: true, iosStoreVersionVerified: true },
});
assert(
  storeVerificationComplete.ok,
  'store verification preflight passes when both stores are already verified',
);

const metadata = prepareUploadMetadata(sessionWithArtifacts);
assert(fs.existsSync(metadata.playMetadataPath), 'play metadata directory exists');
assert(fs.existsSync(metadata.iosReleaseNotesPath), 'ios release notes file exists');

const changelogPath = path.join(
  metadata.playMetadataPath,
  'en-US/changelogs',
  `${baseSession.planned.build}.txt`,
);
assert(fs.existsSync(changelogPath), 'play changelog file exists');
const changelog = fs.readFileSync(changelogPath, 'utf-8');
assert(changelog === 'Short Play copy', 'play changelog uses short notes');

const iosNotes = fs.readFileSync(metadata.iosReleaseNotesPath, 'utf-8');
assert(iosNotes === '• One improvement', 'ios notes use main release notes');

const derivedOnly = resolvePlayWhatsNewText({
  ...baseSession,
  notes: buildReleaseNotes('• Alpha\n• Beta', 'template'),
});
assert(
  derivedOnly === derivePlayShortDescription('• Alpha\n• Beta'),
  'resolvePlayWhatsNewText derives Play copy when short missing',
);

withoutStoreCredentials(() => {
  const preflightCreds = runUploadPreflight(sessionWithArtifacts);
  assert(!preflightCreds.ok, 'upload preflight fails without store credentials');
  assert(
    preflightCreds.issues.some((issue) => issue.includes('PLAY_STORE_JSON_KEY_PATH')),
    'upload preflight mentions Play credentials',
  );
  assert(
    preflightCreds.issues.some((issue) => issue.includes('ASC_KEY_ID')),
    'upload preflight mentions ASC credentials',
  );
});

fs.unlinkSync(tempAab);
fs.unlinkSync(tempIpa);

console.log('app-release-upload tests: OK');
