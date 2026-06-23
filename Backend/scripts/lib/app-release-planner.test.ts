import {
  applyPlannedVersions,
  createReleaseSession,
  isDryRun,
  nativeProjectFilesMatch,
  snapshotNativeProjectFiles,
} from './app-release-planner';
import { proposeNextRelease } from './app-release';
import {
  buildReleaseNotes,
  parseReleaseNotesOutput,
  derivePlayShortDescription,
} from './app-release-notes';
import { clearSession, loadSession, saveSession } from './app-release-session';

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
};
saveSession(sessionWithNotes);
const resumed = loadSession();
assert(resumed?.headSha === session.headSha, 'session resume preserves frozen headSha');
assert(resumed?.planned.version === session.planned.version, 'session resume preserves planned version');
assert(resumed?.notes?.main === '• Saved notes', 'session resume preserves notes');
clearSession();
assert(loadSession() === null, 'clearSession removes persisted session');

console.log('app-release-planner tests: OK');
