import {
  proposeNextRelease,
  readAndroidVersion,
  readIosVersion,
  type NativeVersion,
} from './app-release';
import {
  includesAndroid,
  includesIos,
  type ReleasePlatform,
} from './app-release-session';

export const STORE_VERSION_PREFIX = 'APP_RELEASE_STORE_VERSION_JSON:';

export interface StoreVersionSnapshot {
  android?: NativeVersion;
  ios?: NativeVersion;
}

export function compareVersionStrings(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10));
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10));
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
      throw new Error(`Invalid version segment while comparing ${left} and ${right}`);
    }
    if (leftValue !== rightValue) {
      return leftValue < rightValue ? -1 : 1;
    }
  }
  return 0;
}

export function mergeStoreVersionFloor(versions: NativeVersion[]): NativeVersion {
  if (versions.length === 0) {
    throw new Error('At least one store version is required');
  }
  return {
    version: versions.reduce(
      (best, next) => (compareVersionStrings(next.version, best) > 0 ? next.version : best),
      versions[0].version,
    ),
    build: Math.max(...versions.map((entry) => entry.build)),
  };
}

export function proposeNextFromStoreVersions(versions: NativeVersion[]): NativeVersion {
  return proposeNextRelease(mergeStoreVersionFloor(versions));
}

export function storeVersionsForPlatform(
  snapshot: StoreVersionSnapshot,
  platform: ReleasePlatform,
): NativeVersion[] {
  const versions: NativeVersion[] = [];
  if (includesAndroid(platform) && snapshot.android) {
    versions.push(snapshot.android);
  }
  if (includesIos(platform) && snapshot.ios) {
    versions.push(snapshot.ios);
  }
  return versions;
}

export function validatePlannedAgainstStores(
  planned: NativeVersion,
  snapshot: StoreVersionSnapshot,
  platform: ReleasePlatform,
): string | null {
  const checks: Array<{ label: string; store: NativeVersion }> = [];
  if (includesAndroid(platform) && snapshot.android) {
    checks.push({ label: 'Google Play', store: snapshot.android });
  }
  if (includesIos(platform) && snapshot.ios) {
    checks.push({ label: 'App Store Connect', store: snapshot.ios });
  }

  for (const { label, store } of checks) {
    if (planned.build <= store.build) {
      return `${label} already has build ${store.build}; planned build must be higher than ${store.build}.`;
    }
    if (compareVersionStrings(planned.version, store.version) < 0) {
      return `${label} already has version ${store.version}; planned version cannot go backwards.`;
    }
  }
  return null;
}

export function parseStoreVersionOutput(
  output: string,
  platform: 'android' | 'ios',
): NativeVersion {
  for (const line of output.split(/\r?\n/).reverse()) {
    const markerIndex = line.indexOf(STORE_VERSION_PREFIX);
    if (markerIndex < 0) {
      continue;
    }
    const raw = line.slice(markerIndex + STORE_VERSION_PREFIX.length).trim();
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed.platform !== platform) {
        continue;
      }
      const version = typeof parsed.version === 'string' ? parsed.version.trim() : '';
      const buildRaw = parsed.build;
      const build =
        typeof buildRaw === 'number'
          ? buildRaw
          : typeof buildRaw === 'string'
            ? Number.parseInt(buildRaw, 10)
            : Number.NaN;
      if (!version || !Number.isInteger(build) || build < 0) {
        continue;
      }
      return { version, build };
    } catch {
      // Keep scanning for a valid marker.
    }
  }

  throw new Error(
    `Could not read ${platform === 'android' ? 'Google Play' : 'App Store'} latest version from Fastlane output`,
  );
}

export function readEnvStoreVersion(platform: 'android' | 'ios'): NativeVersion | undefined {
  const prefix = platform === 'android' ? 'APP_RELEASE_ANDROID_STORE' : 'APP_RELEASE_IOS_STORE';
  const version = process.env[`${prefix}_VERSION`]?.trim();
  const buildRaw = process.env[`${prefix}_BUILD`]?.trim();
  if (!version && !buildRaw) {
    return undefined;
  }
  if (!version || !buildRaw) {
    throw new Error(
      `Set both ${prefix}_VERSION and ${prefix}_BUILD to override ${platform} store version lookup.`,
    );
  }
  const build = Number.parseInt(buildRaw, 10);
  if (!Number.isInteger(build) || build < 0) {
    throw new Error(`Invalid ${prefix}_BUILD: ${buildRaw}`);
  }
  return { version, build };
}

export function readLocalNativeVersions(): { android: NativeVersion; ios: NativeVersion } {
  return {
    android: readAndroidVersion(),
    ios: readIosVersion(),
  };
}

export function plannedFromEnvOverrides(fallback: NativeVersion): NativeVersion {
  const version = process.env.APP_RELEASE_VERSION?.trim();
  const buildRaw = process.env.APP_RELEASE_BUILD?.trim();
  if (!version && !buildRaw) {
    return fallback;
  }
  if (!version || !buildRaw) {
    throw new Error(
      'Set both APP_RELEASE_VERSION and APP_RELEASE_BUILD to override the planned release.',
    );
  }
  const build = Number.parseInt(buildRaw, 10);
  if (!Number.isInteger(build) || build < 0) {
    throw new Error(`Invalid APP_RELEASE_BUILD: ${buildRaw}`);
  }
  return { version, build };
}

export function hydrateVersionsFromStores(
  snapshot: StoreVersionSnapshot,
  platform: ReleasePlatform,
): { current: NativeVersion; planned: NativeVersion } {
  const versions = storeVersionsForPlatform(snapshot, platform);
  if (versions.length === 0) {
    throw new Error('No store versions available for the selected release target.');
  }
  const current = mergeStoreVersionFloor(versions);
  const planned = plannedFromEnvOverrides(proposeNextFromStoreVersions(versions));
  const validationError = validatePlannedAgainstStores(planned, snapshot, platform);
  if (validationError) {
    throw new Error(validationError);
  }
  return { current, planned };
}
