import * as fs from 'fs';
import {
  ANDROID_GRADLE,
  IOS_PBX,
  parseHistory,
  prependHistoryRow,
  readAndroidVersion,
  readIosVersion,
  readNativeVersions,
  renderAppReleaseMd,
} from './app-release';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

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
