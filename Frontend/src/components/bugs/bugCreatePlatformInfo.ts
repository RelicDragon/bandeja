import { isAndroid, isCapacitor, isIOS, getAppInfo, getCapacitorPlatform } from '@/utils/capacitor';
import { withTimeout } from './bugCreateTimeout';

export const BUG_CREATE_PLATFORM_INFO_TIMEOUT_MS = 2_500;

type AppInfo = Awaited<ReturnType<typeof getAppInfo>>;

export type BugCreatePlatformInfoDeps = {
  isCapacitor: () => boolean;
  isIOS: () => boolean;
  isAndroid: () => boolean;
  getCapacitorPlatform: () => string | null;
  getAppInfo: () => Promise<AppInfo>;
  timeoutMs?: number;
};

const defaultDeps: BugCreatePlatformInfoDeps = {
  isCapacitor,
  isIOS,
  isAndroid,
  getCapacitorPlatform,
  getAppInfo,
};

function unknownPlatformLabel(deps: BugCreatePlatformInfoDeps): string {
  const platform = deps.isIOS()
    ? 'iOS'
    : deps.isAndroid()
      ? 'Android'
      : deps.getCapacitorPlatform() || 'app';
  return `${platform} (unknown)`;
}

export async function getBugCreatePlatformInfo(
  deps: BugCreatePlatformInfoDeps = defaultDeps
): Promise<string> {
  if (!deps.isCapacitor()) {
    return 'web-app';
  }

  try {
    const appInfo = await withTimeout(
      deps.getAppInfo(),
      deps.timeoutMs ?? BUG_CREATE_PLATFORM_INFO_TIMEOUT_MS
    );
    if (!appInfo) {
      return unknownPlatformLabel(deps);
    }

    const platform = deps.isIOS() ? 'iOS' : deps.isAndroid() ? 'Android' : appInfo.platform;
    return `${platform} ${appInfo.version} (${appInfo.buildNumber})`;
  } catch {
    return unknownPlatformLabel(deps);
  }
}
