import { markReleaseAsShipped } from './lib/app-release-finalize';

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

  console.log('Mark shipped: reading native versions…');
  const result = markReleaseAsShipped({ dryRun, commitBaseline: commit });

  if (!result.baselineUpdated) {
    console.log(
      `Baseline already at HEAD (${result.head.short}) — ${result.version.version} (build ${result.version.build})`,
    );
    return;
  }

  console.log(`Mark shipped: ${result.version.version} (build ${result.version.build})`);
  console.log(`Commit: ${result.head.short} — ${result.head.subject}`);

  if (dryRun) {
    console.log('\nDry run — no files were modified.');
    return;
  }

  console.log('Updated docs/app-release-baseline.txt and docs/APP_RELEASE.md');
}

main();
