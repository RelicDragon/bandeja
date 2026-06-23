import { execFileSync } from 'child_process';
import {
  BASELINE_FILE,
  APP_RELEASE_MD,
  readBaseline,
  readNativeVersions,
  getHeadCommit,
  writeBaseline,
} from './lib/app-release';

function usage(): never {
  console.error(`Usage: app-release-mark-shipped.ts [--commit] [--dry-run]

  Sets app release baseline to HEAD using versionName/versionCode from
  Frontend/android/app/build.gradle and iOS App target (must match).
  Updates docs/app-release-baseline.txt and docs/APP_RELEASE.md automatically.`);
  process.exit(1);
}

function parseArgs(argv: string[]): { commit: boolean; dryRun: boolean } {
  let commit = false;
  let dryRun = false;
  for (const arg of argv) {
    if (arg === '--commit') commit = true;
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '-h' || arg === '--help') usage();
    else {
      console.error(`Unknown option: ${arg}`);
      usage();
    }
  }
  return { commit, dryRun };
}

function main(): void {
  const { commit, dryRun } = parseArgs(process.argv.slice(2));
  const version = readNativeVersions();
  const head = getHeadCommit();

  let currentBaseline: string | null = null;
  try {
    currentBaseline = readBaseline();
  } catch {
    currentBaseline = null;
  }

  if (currentBaseline === head.sha) {
    console.log(`Baseline already at HEAD (${head.short}) — ${version.version} (build ${version.build})`);
    return;
  }

  console.log(`Mark shipped: ${version.version} (build ${version.build})`);
  console.log(`Commit: ${head.short} — ${head.subject}`);

  if (dryRun) {
    console.log('\nDry run — would update:');
    console.log(`  ${BASELINE_FILE}`);
    console.log(`  ${APP_RELEASE_MD}`);
    return;
  }

  writeBaseline(head, version);
  console.log(`Updated ${BASELINE_FILE} and ${APP_RELEASE_MD}`);

  if (commit) {
    execFileSync('git', ['add', BASELINE_FILE, APP_RELEASE_MD], { stdio: 'inherit' });
    const message = `Mark app release ${version.version} (build ${version.build}) as shipped baseline`;
    execFileSync('git', ['commit', '-m', message], { stdio: 'inherit' });
  }
}

main();
