import {
  applyPlannedVersions,
  createReleaseSession,
  getSessionPhase,
  isDryRun,
  nativeProjectFilesMatch,
  snapshotNativeProjectFiles,
  storeConfigComplete,
} from './app-release-planner';
import { proposeNextRelease } from './app-release';
import {
  buildReleaseNotes,
  parseReleaseNotesOutput,
  derivePlayShortDescription,
} from './app-release-notes';
import { cleanReleaseWorkspace, clearSession, hasSavedSession, loadSession, saveSession, SESSION_DIR } from './app-release-session';
import * as fs from 'fs';
import * as path from 'path';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const sampleAiOutput = `• Faster game list loading
• Improved chat sync when offline

---SHORT---
Faster game lists and more reliable offline chat sync in this Bandeja update.`;

const parsed = parseReleaseNotesOutput(sampleAiOutput);
assert(parsed.main.includes('Faster game list loading'), 'parseReleaseNotesOutput main');
assert(Boolean(parsed.short?.includes('offline chat sync')), 'parseReleaseNotesOutput short');

const built = buildReleaseNotes('• One improvement', 'custom');
assert(built.short === 'One improvement', 'derive short from single bullet');

const longMain = `• ${'A'.repeat(600)}`;
const truncated = derivePlayShortDescription(longMain);
assert(Boolean(truncated && truncated.length <= 500), 'derivePlayShortDescription truncates');

const session = createReleaseSession();
const expected = proposeNextRelease(session.current);
assert(
  session.planned.version === expected.version && session.planned.build === expected.build,
  'createReleaseSession proposes next release',
);
assert(session.headSha.length === 40, 'createReleaseSession freezes full head sha');
assert(session.baselineSha.length === 40, 'createReleaseSession reads baseline sha');

const before = snapshotNativeProjectFiles();
const dryRunWas = process.env.APP_RELEASE_DRY_RUN;
process.env.APP_RELEASE_DRY_RUN = '1';
assert(isDryRun(), 'isDryRun reads env');

const notesSession = {
  ...session,
  notes: buildReleaseNotes('• Test notes', 'template', 'Short test notes'),
};
applyPlannedVersions(notesSession, { dryRun: true });
const afterDry = snapshotNativeProjectFiles();
assert(nativeProjectFilesMatch(before, afterDry), 'dry-run leaves native files unchanged');

process.env.APP_RELEASE_DRY_RUN = dryRunWas;

const sessionWithNotes = {
  ...session,
  notes: buildReleaseNotes('• Saved notes', 'custom'),
  artifacts: {},
  store: {},
};
saveSession(sessionWithNotes);
const resumed = loadSession();
assert(resumed?.headSha === session.headSha, 'session resume preserves frozen headSha');
assert(resumed?.planned.version === session.planned.version, 'session resume preserves planned version');
assert(resumed?.notes?.main === '• Saved notes', 'session resume preserves notes');
assert(resumed?.artifacts !== undefined, 'session resume includes artifacts');
assert(resumed?.store !== undefined, 'session resume includes store');
assert(getSessionPhase(sessionWithNotes) === 'ready-to-apply', 'session with notes is ready-to-apply');
assert(
  storeConfigComplete({ androidTrack: 'internal', iosSubmitForReview: false }),
  'storeConfigComplete accepts full store config',
);
clearSession();
assert(loadSession() === null, 'clearSession removes persisted session');
assert(!hasSavedSession(), 'hasSavedSession false after clear');

saveSession(sessionWithNotes);
assert(hasSavedSession(), 'hasSavedSession true when file exists');

const iosDir = path.join(SESSION_DIR, 'ios');
const uploadDir = path.join(SESSION_DIR, 'upload');
fs.mkdirSync(iosDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });
fs.writeFileSync(path.join(iosDir, 'marker.txt'), 'test');
fs.writeFileSync(path.join(uploadDir, 'marker.txt'), 'test');

cleanReleaseWorkspace({ buildArtifacts: true });
assert(loadSession() === null, 'cleanReleaseWorkspace clears session');
assert(!fs.existsSync(iosDir), 'cleanReleaseWorkspace removes ios dir');
assert(!fs.existsSync(uploadDir), 'cleanReleaseWorkspace removes upload dir');

console.log('app-release-planner tests: OK');
