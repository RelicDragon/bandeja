import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export const ROOT = path.join(__dirname, '../../..');
export const BASELINE_FILE = path.join(ROOT, 'docs/app-release-baseline.txt');
export const APP_RELEASE_MD = path.join(ROOT, 'docs/APP_RELEASE.md');
export const ANDROID_GRADLE = path.join(ROOT, 'Frontend/android/app/build.gradle');
export const IOS_PBX = path.join(ROOT, 'Frontend/ios/App/App.xcodeproj/project.pbxproj');
const MAIN_IOS_BUNDLE_LINE = 'PRODUCT_BUNDLE_IDENTIFIER = com.funified.bandeja;';

export interface NativeVersion {
  version: string;
  build: number;
}

export interface HeadCommit {
  sha: string;
  short: string;
  date: string;
  subject: string;
}

export interface HistoryRow {
  version: string;
  build: number;
  short: string;
  date: string;
}

export function readBaseline(): string {
  if (!fs.existsSync(BASELINE_FILE)) {
    throw new Error(`Missing ${BASELINE_FILE}`);
  }
  const baseline = fs.readFileSync(BASELINE_FILE, 'utf-8').trim();
  if (!baseline) {
    throw new Error(`Baseline file is empty: ${BASELINE_FILE}`);
  }
  try {
    execSync(`git cat-file -e ${baseline}^{commit}`, { cwd: ROOT, stdio: 'pipe' });
  } catch {
    throw new Error(`Unknown commit in baseline: ${baseline}`);
  }
  return baseline;
}

export function commitCountSince(baseline: string, ref = 'HEAD'): number {
  const out = execSync(`git rev-list --count ${baseline}..${ref}`, { cwd: ROOT }).toString().trim();
  return Number.parseInt(out, 10);
}

export function gatherCommitLog(baseline: string, ref = 'HEAD'): string {
  return execSync(
    `git log ${baseline}..${ref} --reverse --format='=== %h | %ad | %s ===%n%b' --date=short --name-only`,
    { cwd: ROOT, maxBuffer: 10 * 1024 * 1024 },
  ).toString();
}

export function bumpVersion(version: string): string {
  const trimmed = version.trim();
  if (!trimmed) {
    throw new Error('Version is empty');
  }
  const parts = trimmed.split('.');
  if (parts.some((part) => part === '')) {
    throw new Error(`Invalid version: ${version}`);
  }
  const last = parts[parts.length - 1];
  const num = Number.parseInt(last, 10);
  if (!Number.isFinite(num) || String(num) !== last) {
    throw new Error(`Invalid version segment in ${version}`);
  }
  parts[parts.length - 1] = String(num + 1);
  return parts.join('.');
}

export function bumpBuild(build: number): number {
  if (!Number.isInteger(build) || build < 0) {
    throw new Error(`Invalid build number: ${build}`);
  }
  return build + 1;
}

export function proposeNextRelease(current: NativeVersion): NativeVersion {
  return {
    version: bumpVersion(current.version),
    build: bumpBuild(current.build),
  };
}

function assertValidNativeVersion(version: NativeVersion): void {
  const trimmed = version.version.trim();
  if (!trimmed) {
    throw new Error('Version is empty');
  }
  const parts = trimmed.split('.');
  if (parts.some((part) => part === '')) {
    throw new Error(`Invalid version: ${version.version}`);
  }
  for (const part of parts) {
    const num = Number.parseInt(part, 10);
    if (!Number.isFinite(num) || String(num) !== part) {
      throw new Error(`Invalid version for native write: ${version.version}`);
    }
  }
  if (!Number.isInteger(version.build) || version.build < 0) {
    throw new Error(`Invalid build number: ${version.build}`);
  }
}

export function readAndroidVersion(gradlePath = ANDROID_GRADLE): NativeVersion {
  const gradle = fs.readFileSync(gradlePath, 'utf-8');
  const version = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
  const buildRaw = gradle.match(/versionCode\s+(\d+)/)?.[1];
  if (!version || !buildRaw) {
    throw new Error(`Could not parse version from ${gradlePath}`);
  }
  const build = Number.parseInt(buildRaw, 10);
  if (!Number.isInteger(build) || build < 0) {
    throw new Error(`Invalid versionCode in ${gradlePath}`);
  }
  return { version, build };
}

export function readIosVersion(pbxPath = IOS_PBX): NativeVersion {
  const lines = fs.readFileSync(pbxPath, 'utf-8').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() !== MAIN_IOS_BUNDLE_LINE) continue;
    let version: string | null = null;
    let build: string | null = null;
    for (let j = Math.max(0, i - 30); j < Math.min(lines.length, i + 5); j += 1) {
      const marketing = lines[j].match(/MARKETING_VERSION = (.+);/);
      const project = lines[j].match(/CURRENT_PROJECT_VERSION = (.+);/);
      if (marketing) version = marketing[1].trim();
      if (project) build = project[1].trim();
    }
    if (version && build) {
      return { version, build: Number.parseInt(build, 10) };
    }
  }
  throw new Error(`Could not parse iOS version for ${MAIN_IOS_BUNDLE_LINE} in ${pbxPath}`);
}

export function readNativeVersions(paths?: { android?: string; ios?: string }): NativeVersion {
  const android = readAndroidVersion(paths?.android);
  const ios = readIosVersion(paths?.ios);
  if (android.version !== ios.version || android.build !== ios.build) {
    throw new Error(
      `Android (${android.version} / ${android.build}) and iOS (${ios.version} / ${ios.build}) versions do not match`,
    );
  }
  return android;
}

export function writeAndroidVersionContent(gradle: string, version: NativeVersion): string {
  assertValidNativeVersion(version);
  if (!/versionName\s+"[^"]+"/.test(gradle)) {
    throw new Error('Could not find versionName in Gradle content');
  }
  if (!/versionCode\s+\d+/.test(gradle)) {
    throw new Error('Could not find versionCode in Gradle content');
  }
  return gradle
    .replace(/versionName\s+"[^"]+"/, `versionName "${version.version}"`)
    .replace(/versionCode\s+\d+/, `versionCode ${version.build}`);
}

export function writeIosVersionContent(pbx: string, version: NativeVersion): string {
  assertValidNativeVersion(version);
  const lines = pbx.split('\n');
  const result = [...lines];
  let updated = 0;

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() !== MAIN_IOS_BUNDLE_LINE) continue;
    for (let j = Math.max(0, i - 30); j < Math.min(lines.length, i + 5); j += 1) {
      const marketing = lines[j].match(/^(\s*)MARKETING_VERSION = (.+);$/);
      if (marketing) {
        result[j] = `${marketing[1]}MARKETING_VERSION = ${version.version};`;
        updated += 1;
      }
      const project = lines[j].match(/^(\s*)CURRENT_PROJECT_VERSION = (.+);$/);
      if (project) {
        result[j] = `${project[1]}CURRENT_PROJECT_VERSION = ${version.build};`;
        updated += 1;
      }
    }
  }

  if (updated === 0) {
    throw new Error(`Could not find iOS version fields for ${MAIN_IOS_BUNDLE_LINE}`);
  }

  return result.join('\n');
}

export function writeAndroidVersion(version: NativeVersion, gradlePath = ANDROID_GRADLE): void {
  const gradle = fs.readFileSync(gradlePath, 'utf-8');
  fs.writeFileSync(gradlePath, writeAndroidVersionContent(gradle, version), 'utf-8');
}

export function writeIosVersion(version: NativeVersion, pbxPath = IOS_PBX): void {
  const pbx = fs.readFileSync(pbxPath, 'utf-8');
  fs.writeFileSync(pbxPath, writeIosVersionContent(pbx, version), 'utf-8');
}

export function writeNativeVersions(
  version: NativeVersion,
  paths?: { android?: string; ios?: string },
): void {
  assertValidNativeVersion(version);
  const androidPath = paths?.android ?? ANDROID_GRADLE;
  const iosPath = paths?.ios ?? IOS_PBX;
  const androidBackup = fs.readFileSync(androidPath, 'utf-8');
  const iosBackup = fs.readFileSync(iosPath, 'utf-8');

  try {
    writeAndroidVersion(version, androidPath);
    writeIosVersion(version, iosPath);
    const readBack = readNativeVersions({ android: androidPath, ios: iosPath });
    if (readBack.version !== version.version || readBack.build !== version.build) {
      throw new Error(
        `Post-write version mismatch: expected ${version.version}/${version.build}, got ${readBack.version}/${readBack.build}`,
      );
    }
  } catch (error) {
    fs.writeFileSync(androidPath, androidBackup, 'utf-8');
    fs.writeFileSync(iosPath, iosBackup, 'utf-8');
    throw error;
  }
}

export function getHeadCommit(ref = 'HEAD'): HeadCommit {
  const format = '%H%n%h%n%ad%n%s';
  const out = execSync(`git log -1 ${ref} --format=${format} --date=short`, { cwd: ROOT })
    .toString()
    .trimEnd();
  const [sha, short, date, ...subjectParts] = out.split('\n');
  if (!sha || !short || !date) {
    throw new Error(`Could not read git commit at ${ref}`);
  }
  return { sha, short, date, subject: subjectParts.join('\n') };
}

export function parseHistory(md: string): HistoryRow[] {
  const rows: HistoryRow[] = [];
  for (const line of md.split('\n')) {
    const match = line.match(/^\| ([^|]+) \| (\d+) \| `([^`]+)` \| (\d{4}-\d{2}-\d{2}) \|$/);
    if (!match) continue;
    rows.push({
      version: match[1].trim(),
      build: Number.parseInt(match[2], 10),
      short: match[3].trim(),
      date: match[4],
    });
  }
  return rows;
}

export function prependHistoryRow(history: HistoryRow[], row: HistoryRow): HistoryRow[] {
  if (history.some((entry) => entry.short === row.short)) {
    return history;
  }
  return [row, ...history];
}

const WORKFLOW_SECTION = `### Unified release CLI (recommended)

\`\`\`bash
./scripts/app-release.sh
\`\`\`

Dry-run planner: \`APP_RELEASE_DRY_RUN=1 ./scripts/app-release.sh\`. Resume after failure: \`APP_RELEASE_RESUME=1 ./scripts/app-release.sh\`.

See this file for store API credentials, Android signing, and internal-track smoke test steps.

### Headless scripts

Generate **What's new** (LLM summarizes commits since baseline):

   \`\`\`bash
   ./scripts/app-release-whats-new.sh
   \`\`\`

   Preview prompt without calling the API:

   \`\`\`bash
   ./scripts/app-release-whats-new.sh --dry-run
   \`\`\`

   Save to a file:

   \`\`\`bash
   ./scripts/app-release-whats-new.sh --save release-notes.txt
   \`\`\`

   Requires \`AI_PROVIDER\` + \`OPENAI_API_KEY\` or \`DEEPSEEK_API_KEY\` in \`Backend/.env\`.

   Raw commit list (no LLM):

   \`\`\`bash
   ./scripts/app-release-changes.sh
   ./scripts/app-release-changes.sh --full
   \`\`\`

**Mark as shipped** (manual fallback after store submission):

   \`\`\`bash
   ./scripts/app-release-mark-shipped.sh --commit
   \`\`\`

   Run on the branch/commit you shipped (usually right after the version-bump commit). Uses \`baseline..HEAD\` for the next cycle's What's new.`;

export function renderAppReleaseMd(commit: HeadCommit, version: NativeVersion, history: HistoryRow[]): string {
  const historyLines = history
    .map((row) => `| ${row.version} | ${row.build} | \`${row.short}\` | ${row.date} |`)
    .join('\n');

  return `# App store release baseline

Marks the last commit that was shipped to **Google Play** and **App Store**. Use it to draft the next **What's new** section from everything merged after that point.

## Current baseline

| | |
|---|---|
| **Version** | ${version.version} |
| **Build** | ${version.build} |
| **Commit** | \`${commit.sha}\` |
| **Short** | \`${commit.short}\` |
| **Date** | ${commit.date} |
| **Message** | ${commit.subject} |

Canonical commit hash: \`docs/app-release-baseline.txt\` (one line, full SHA).

## Before the next store release

${WORKFLOW_SECTION}

## History

| Version | Build | Commit | Date |
|---------|-------|--------|------|
${historyLines}
`;
}

export function writeBaseline(commit: HeadCommit, version: NativeVersion): void {
  fs.writeFileSync(BASELINE_FILE, `${commit.sha}\n`, 'utf-8');

  const existingMd = fs.existsSync(APP_RELEASE_MD) ? fs.readFileSync(APP_RELEASE_MD, 'utf-8') : '';
  const history = prependHistoryRow(parseHistory(existingMd), {
    version: version.version,
    build: version.build,
    short: commit.short,
    date: commit.date,
  });

  fs.writeFileSync(APP_RELEASE_MD, renderAppReleaseMd(commit, version, history), 'utf-8');
}
