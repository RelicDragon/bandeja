import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ANDROID_GRADLE,
  IOS_PBX,
  bumpBuild,
  bumpVersion,
  parseHistory,
  prependHistoryRow,
  proposeNextRelease,
  readAndroidVersion,
  readIosVersion,
  readNativeVersions,
  renderAppReleaseMd,
  writeAndroidVersionContent,
  writeIosVersionContent,
  writeNativeVersions,
} from './app-release';

const FIXTURES = path.join(__dirname, 'fixtures');

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function assertThrows(fn: () => void, msg: string): void {
  try {
    fn();
    console.error('FAIL: expected throw —', msg);
    process.exit(1);
  } catch {
    // expected
  }
}

assert(bumpVersion('0.96.40') === '0.96.41', 'bumpVersion patch segment');
assert(bumpVersion('1.0.9') === '1.0.10', 'bumpVersion carries no overflow logic');
assert(bumpBuild(154) === 155, 'bumpBuild increments');
assert(
  proposeNextRelease({ version: '0.96.40', build: 154 }).version === '0.96.41' &&
    proposeNextRelease({ version: '0.96.40', build: 154 }).build === 155,
  'proposeNextRelease default bump',
);

assertThrows(() => bumpVersion(''), 'bumpVersion rejects empty');
assertThrows(() => bumpVersion('1.0.beta'), 'bumpVersion rejects non-numeric segment');
assertThrows(() => bumpBuild(-1), 'bumpBuild rejects negative');
assertThrows(() => bumpBuild(1.5), 'bumpBuild rejects non-integer');

const sampleMd = `# App store release baseline

## History

| Version | Build | Commit | Date |
|---------|-------|--------|------|
| 0.96.39 | 153 | \`abc12345\` | 2026-06-20 |
| 0.96.38 | 152 | \`def67890\` | 2026-06-15 |
`;

const history = parseHistory(sampleMd);
assert(history.length === 2, 'parseHistory row count');
assert(history[0].version === '0.96.39' && history[0].build === 153, 'parseHistory first row');
assert(history[1].short === 'def67890', 'parseHistory second short sha');

const rendered = renderAppReleaseMd(
  {
    sha: '109da47b0a2c3a0cf59fcf86c00cf63e92315a2e',
    short: '109da47b',
    date: '2026-06-23',
    subject: 'Update versioning',
  },
  { version: '0.96.40', build: 154 },
  history,
);
assert(rendered.includes('**Version** | 0.96.40'), 'render current version');
assert(rendered.includes('`109da47b0a2c3a0cf59fcf86c00cf63e92315a2e`'), 'render full sha');
assert(rendered.includes('| 0.96.39 | 153 | `abc12345` | 2026-06-20 |'), 'render history row');
assert(rendered.includes('./scripts/app-release-whats-new.sh'), 'render workflow whats-new');
assert(rendered.includes('./scripts/app-release-mark-shipped.sh'), 'render workflow mark-shipped');

const withNew = prependHistoryRow(history, {
  version: '0.96.40',
  build: 154,
  short: 'newshort',
  date: '2026-06-23',
});
assert(withNew.length === 3 && withNew[0].short === 'newshort', 'prependHistoryRow adds row');

const withDup = prependHistoryRow(withNew, {
  version: '0.96.40',
  build: 154,
  short: 'newshort',
  date: '2026-06-23',
});
assert(withDup.length === 3, 'prependHistoryRow skips duplicate short sha');

const fixtureGradle = fs.readFileSync(path.join(FIXTURES, 'android-build.gradle'), 'utf-8');
const fixturePbx = fs.readFileSync(path.join(FIXTURES, 'ios-project.pbxproj'), 'utf-8');
const next = { version: '0.96.41', build: 155 };

const gradleWritten = writeAndroidVersionContent(fixtureGradle, next);
assert(gradleWritten.includes('versionName "0.96.41"'), 'gradle write versionName');
assert(gradleWritten.includes('versionCode 155'), 'gradle write versionCode');

const pbxWritten = writeIosVersionContent(fixturePbx, next);
assert(pbxWritten.includes('MARKETING_VERSION = 0.96.41;'), 'pbx write marketing version');
assert(pbxWritten.includes('CURRENT_PROJECT_VERSION = 155;'), 'pbx write project version');
assert(pbxWritten.includes('MARKETING_VERSION = 0.51;'), 'pbx watch marketing unchanged');
assert(pbxWritten.includes('CURRENT_PROJECT_VERSION = 2;'), 'pbx watch build unchanged');
assert(
  (pbxWritten.match(/MARKETING_VERSION = 0.96.41;/g) ?? []).length === 2,
  'pbx updates both main app configurations',
);

assertThrows(
  () => writeAndroidVersionContent('android { }', next),
  'gradle write missing fields throws',
);
assertThrows(
  () => writeIosVersionContent('PRODUCT_BUNDLE_IDENTIFIER = com.other.app;', next),
  'pbx write missing main target throws',
);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-release-test-'));
const tmpGradle = path.join(tmpDir, 'build.gradle');
const tmpPbx = path.join(tmpDir, 'project.pbxproj');
fs.writeFileSync(tmpGradle, fixtureGradle, 'utf-8');
fs.writeFileSync(tmpPbx, fixturePbx, 'utf-8');

writeNativeVersions(next, { android: tmpGradle, ios: tmpPbx });
const afterWrite = readNativeVersions({ android: tmpGradle, ios: tmpPbx });
assert(afterWrite.version === '0.96.41' && afterWrite.build === 155, 'writeNativeVersions parity');

const pbxAfterWrite = fs.readFileSync(tmpPbx, 'utf-8');
assert(pbxAfterWrite.includes('com.funified.bandeja.watchkitapp'), 'watch bundle id preserved');
assert(pbxAfterWrite.includes('MARKETING_VERSION = 0.51;'), 'watch version preserved after write');

fs.writeFileSync(tmpGradle, fixtureGradle, 'utf-8');
fs.writeFileSync(tmpPbx, 'broken', 'utf-8');
assertThrows(
  () => writeNativeVersions(next, { android: tmpGradle, ios: tmpPbx }),
  'writeNativeVersions rolls back on ios failure',
);
const rolledGradle = fs.readFileSync(tmpGradle, 'utf-8');
assert(rolledGradle.includes('versionName "0.96.40"'), 'android rolled back after failed write');

fs.rmSync(tmpDir, { recursive: true, force: true });

assert(fs.existsSync(ANDROID_GRADLE), 'android gradle exists');
assert(fs.existsSync(IOS_PBX), 'ios pbxproj exists');

const android = readAndroidVersion();
const ios = readIosVersion();
const native = readNativeVersions();
assert(android.version === ios.version, 'android/ios versionName parity');
assert(android.build === ios.build, 'android/ios build parity');
assert(native.version === android.version, 'readNativeVersions version');
assert(native.build === android.build, 'readNativeVersions build');

console.log('app-release tests: OK');
