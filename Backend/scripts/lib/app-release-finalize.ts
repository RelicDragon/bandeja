import { execFileSync } from 'child_process';
import * as fs from 'fs';
import {
  ANDROID_GRADLE,
  APP_RELEASE_MD,
  BASELINE_FILE,
  IOS_PBX,
  getHeadCommit,
  readBaseline,
  readNativeVersions,
  writeBaseline,
  type HeadCommit,
  type NativeVersion,
} from './app-release';

export interface FinalizeResult {
  head: HeadCommit;
  version: NativeVersion;
  baselineUpdated: boolean;
}

export interface FinalizeOptions {
  dryRun?: boolean;
  commitBaseline?: boolean;
}

export function markReleaseAsShipped(options?: FinalizeOptions): FinalizeResult {
  const dryRun = options?.dryRun ?? false;
  const version = readNativeVersions();
  const head = getHeadCommit();

  let currentBaseline: string | null = null;
  try {
    currentBaseline = readBaseline();
  } catch {
    currentBaseline = null;
  }

  if (currentBaseline === head.sha) {
    return { head, version, baselineUpdated: false };
  }

  if (!dryRun) {
    writeBaseline(head, version);
    if (options?.commitBaseline) {
      commitBaselineUpdate(version);
    }
  }

  return { head, version, baselineUpdated: true };
}

export function commitVersionBump(version: NativeVersion): void {
  const files = [ANDROID_GRADLE, IOS_PBX];
  execFileSync('git', ['add', ...files], { stdio: 'inherit' });
  const message = `Bump app release to ${version.version} (build ${version.build})`;
  execFileSync('git', ['commit', '-m', message], { stdio: 'inherit' });
}

function commitBaselineUpdate(version: NativeVersion): void {
  execFileSync('git', ['add', BASELINE_FILE, APP_RELEASE_MD], { stdio: 'inherit' });
  const message = `Mark app release ${version.version} (build ${version.build}) as shipped baseline`;
  execFileSync('git', ['commit', '-m', message], { stdio: 'inherit' });
}

export function versionBumpFilesChanged(): boolean {
  if (!fs.existsSync(ANDROID_GRADLE) || !fs.existsSync(IOS_PBX)) {
    return false;
  }
  try {
    const status = execFileSync('git', ['status', '--porcelain', ANDROID_GRADLE, IOS_PBX], {
      encoding: 'utf-8',
    }).trim();
    return status.length > 0;
  } catch {
    return false;
  }
}
