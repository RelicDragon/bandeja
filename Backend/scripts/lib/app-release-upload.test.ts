import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildReleaseNotes, derivePlayShortDescription } from './app-release-notes';
import {
  PLAY_TRACKS,
  prepareUploadMetadata,
  resolvePlayWhatsNewText,
  runUploadPreflight,
} from './app-release-upload';
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
  notes: buildReleaseNotes('• One improvement', 'custom', 'Short Play copy'),
  artifacts: {
    aab: path.join(os.tmpdir(), 'missing-aab.aab'),
    ipa: path.join(os.tmpdir(), 'missing-ipa.ipa'),
  },
  store: {
    androidTrack: 'internal',
    iosSubmitForReview: false,
  },
};

assert(PLAY_TRACKS.includes('internal'), 'PLAY_TRACKS includes internal');
assert(PLAY_TRACKS.includes('production'), 'PLAY_TRACKS includes production');

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

const preflightMissing = runUploadPreflight({
  ...sessionWithArtifacts,
  store: {},
});
assert(!preflightMissing.ok, 'upload preflight fails without store config');
assert(
  preflightMissing.issues.some((issue) => issue.includes('Google Play track')),
  'upload preflight mentions Play track',
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

fs.unlinkSync(tempAab);
fs.unlinkSync(tempIpa);

console.log('app-release-upload tests: OK');
