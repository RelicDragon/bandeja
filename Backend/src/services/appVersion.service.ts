import prisma from '../config/database';

export type VersionCheckResult = {
  status: 'ok' | 'optional_update' | 'blocking_update';
  minVersion?: string;
  message?: string;
};

let cachedVersionRequirements: Map<string, any> = new Map();
let lastCacheUpdate = 0;
let cacheRefreshPromise: Promise<void> | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export class AppVersionService {
  static async checkVersion(
    platform: string,
    buildNumber: number
  ): Promise<VersionCheckResult> {
    await this.refreshCacheIfNeeded();

    const requirement = cachedVersionRequirements.get(platform.toLowerCase());

    if (!requirement) {
      return { status: 'ok' };
    }

    if (buildNumber < requirement.minBuildNumber) {
      return {
        status: requirement.isBlocking ? 'blocking_update' : 'optional_update',
        minVersion: requirement.minVersion,
        message: requirement.message || undefined,
      };
    }

    return { status: 'ok' };
  }

  static async refreshCacheIfNeeded() {
    const now = Date.now();
    if (now - lastCacheUpdate > CACHE_TTL) {
      if (!cacheRefreshPromise) {
        cacheRefreshPromise = this.refreshCache().finally(() => {
          cacheRefreshPromise = null;
        });
      }
      await cacheRefreshPromise;
    }
  }

  static async refreshCache() {
    const requirements = await prisma.appVersionRequirement.findMany();
    cachedVersionRequirements.clear();
    requirements.forEach((req) => {
      cachedVersionRequirements.set(req.platform.toLowerCase(), req);
    });
    lastCacheUpdate = Date.now();
  }

  static clearCache() {
    cachedVersionRequirements.clear();
    lastCacheUpdate = 0;
    cacheRefreshPromise = null;
  }
}
