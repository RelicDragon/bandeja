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

export function readAndroidVersion(): NativeVersion {
  const gradle = fs.readFileSync(ANDROID_GRADLE, 'utf-8');
  const version = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
  const buildRaw = gradle.match(/versionCode\s+(\d+)/)?.[1];
  if (!version || !buildRaw) {
    throw new Error(`Could not parse version from ${ANDROID_GRADLE}`);
  }
  return { version, build: Number.parseInt(buildRaw, 10) };
}

export function readIosVersion(): NativeVersion {
  const lines = fs.readFileSync(IOS_PBX, 'utf-8').split('\n');
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
  throw new Error(`Could not parse iOS version for ${MAIN_IOS_BUNDLE_LINE} in ${IOS_PBX}`);
}

export function readNativeVersions(): NativeVersion {
  const android = readAndroidVersion();
  const ios = readIosVersion();
  if (android.version !== ios.version || android.build !== ios.build) {
    throw new Error(
      `Android (${android.version} / ${android.build}) and iOS (${ios.version} / ${ios.build}) versions do not match`,
    );
  }
  return android;
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

const WORKFLOW_SECTION = `1. Generate **What's new** (LLM summarizes commits since baseline):

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

2. Paste the main section into App Store Connect and Google Play; use the \`---SHORT---\` paragraph for Play if needed.

3. Bump \`versionName\` / \`versionCode\` (Android) and iOS project version + build.

4. Commit the version bump (and any last-minute fixes).

5. Submit to stores.

6. **Mark as shipped** (updates baseline from native version files + current \`HEAD\` — no manual editing):

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
