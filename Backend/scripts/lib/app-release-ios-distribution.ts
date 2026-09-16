import {
  includesAndroid,
  includesIos,
  type ReleasePlatform,
} from './app-release-session';

export const IOS_DISTRIBUTIONS = ['testflight', 'beta', 'prepare', 'submit'] as const;
export type IosDistribution = (typeof IOS_DISTRIBUTIONS)[number];

const IOS_DISTRIBUTION_ALIASES: Record<string, IosDistribution> = {
  testflight: 'testflight',
  internal: 'testflight',
  beta: 'beta',
  external: 'beta',
  prepare: 'prepare',
  upload: 'prepare',
  submit: 'submit',
  review: 'submit',
  production: 'submit',
};

export function resolveIosDistribution(value: string | undefined): IosDistribution | null {
  if (!value?.trim()) {
    return null;
  }
  return IOS_DISTRIBUTION_ALIASES[value.trim().toLowerCase()] ?? null;
}

export function iosSubmitsForReview(distribution: string | undefined): boolean {
  return resolveIosDistribution(distribution) === 'submit';
}

export function iosTouchesAppStoreVersion(distribution: string | undefined): boolean {
  const resolved = resolveIosDistribution(distribution);
  return resolved === 'prepare' || resolved === 'submit';
}

export function iosIsTestFlightOnly(distribution: string | undefined): boolean {
  const resolved = resolveIosDistribution(distribution);
  return resolved === 'testflight' || resolved === 'beta';
}

export function iosDistributesExternally(distribution: string | undefined): boolean {
  return resolveIosDistribution(distribution) === 'beta';
}

export function parseTestFlightGroups(value: string): string[] {
  return value
    .split(',')
    .map((group) => group.trim())
    .filter((group) => group.length > 0);
}

export function iosDistributionLabel(
  distribution: string | undefined,
  groups?: string[],
): string {
  const resolved = resolveIosDistribution(distribution);
  if (resolved === 'testflight') {
    return 'TestFlight Internal (does not touch App Store version)';
  }
  if (resolved === 'beta') {
    const groupLabel = groups?.length ? ` groups: ${groups.join(', ')}` : '';
    return `TestFlight Beta${groupLabel} (does not touch App Store version)`;
  }
  if (resolved === 'submit') {
    return 'upload + submit for review';
  }
  if (resolved === 'prepare') {
    return 'prepare App Store version, do not submit';
  }
  return 'not set';
}

export function shouldUpdateShippedBaseline(
  platform: ReleasePlatform | undefined,
  store?: { androidTrack?: string; iosDistribution?: string },
): boolean {
  if (iosIsTestFlightOnly(store?.iosDistribution) && includesIos(platform)) {
    return includesAndroid(platform) && store?.androidTrack === 'production';
  }
  if (platform === undefined || platform === 'both' || platform === 'android') {
    return true;
  }
  return iosTouchesAppStoreVersion(store?.iosDistribution);
}
