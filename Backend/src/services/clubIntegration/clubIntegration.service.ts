import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import {
  ClubIntegrationFunction,
  ClubIntegrationParams,
  ExternalCourtSlot,
} from './types';
import path from 'path';
import fs from 'fs';

const CACHE_DURATION_MS =
  process.env.NODE_ENV === 'development' ? 3 * 60 * 1000 : 10 * 60 * 1000;


// Resolve scripts directory relative to project root (works in both dev and prod)
// In dev: __dirname is src/services/clubIntegration -> ../../../scripts = Backend/scripts
// In prod: __dirname is dist/services/clubIntegration -> ../../../scripts = Backend/scripts
// Both resolve to the same location since scripts are not in dist
function getScriptsDir(): string {
  // Go up from current directory to project root, then into scripts
  // This works because scripts folder is at Backend/scripts, not in dist
  const projectRoot = path.resolve(__dirname, '../../..');
  return path.join(projectRoot, 'scripts', 'club-integrations');
}

const SCRIPTS_DIR = getScriptsDir();

interface CachedResult {
  result: ExternalCourtSlot[];
  timestamp: Date;
}

export class ClubIntegrationService {
  private static scriptCache = new Map<string, ClubIntegrationFunction>();
  private static resultCache = new Map<string, CachedResult>();
  private static invalidatingCacheKeys = new Set<string>();

  private static getCacheKey(
    clubId: string,
    startDate: Date,
    endDate: Date,
    duration: number,
    isDateIndependent: boolean
  ): string {
    if (isDateIndependent) {
      return `${clubId}-all-${duration}`;
    }
    return `${clubId}-${startDate.toISOString()}-${endDate.toISOString()}-${duration}`;
  }

  private static filterSlotsByDateRange(
    slots: ExternalCourtSlot[],
    startDate: Date,
    endDate: Date
  ): ExternalCourtSlot[] {
    const start = startDate.getTime();
    const end = endDate.getTime();
    
    return slots.filter((slot) => {
      const slotStart = new Date(slot.startTime).getTime();
      const slotEnd = new Date(slot.endTime).getTime();
      return slotStart < end && slotEnd > start;
    });
  }

  static async getExternalSlots(
    clubId: string,
    startDate: Date,
    endDate: Date,
    duration: number
  ): Promise<{ slots: ExternalCourtSlot[]; isLoading: boolean }> {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      include: { courts: true },
    });

    if (!club) {
      throw new ApiError(404, 'Club not found');
    }

    if (!club.integrationScriptName) {
      return { slots: [], isLoading: false };
    }

    const isDateIndependent = club.integrationScriptDateIndependent ?? false;
    const cacheKey = this.getCacheKey(clubId, startDate, endDate, duration, isDateIndependent);
    const cached = this.resultCache.get(cacheKey);
    const isInvalidating = this.invalidatingCacheKeys.has(cacheKey);

    const getFilteredSlots = (slots: ExternalCourtSlot[]) =>
      isDateIndependent ? this.filterSlotsByDateRange(slots, startDate, endDate) : slots;

    if (cached) {
      const age = Date.now() - cached.timestamp.getTime();
      const isValid = age < CACHE_DURATION_MS;

      if (!isValid && !isInvalidating) {
        this.invalidateCacheInBackground(clubId, startDate, endDate, duration);
      }

      return {
        slots: getFilteredSlots(cached.result),
        isLoading: !isValid && !isInvalidating,
      };
    }

    if (!isInvalidating) {
      this.invalidateCacheInBackground(clubId, startDate, endDate, duration);
    }
    return { slots: [], isLoading: true };
  }

  static async mapExternalSlotsToCourts(
    clubId: string,
    externalSlots: ExternalCourtSlot[]
  ): Promise<Array<ExternalCourtSlot & { internalCourtId: string | null; internalCourtName: string | null }>> {
    const courts = await prisma.court.findMany({
      where: { clubId, isActive: true },
    });

    const courtMap = new Map<string, { id: string; name: string }>();
    courts.forEach((court) => {
      if (court.externalCourtId) {
        courtMap.set(court.externalCourtId, { id: court.id, name: court.name });
      }
    });

    return externalSlots.map((slot) => {
      const court = courtMap.get(slot.externalCourtId);
      return {
        ...slot,
        internalCourtId: court?.id || null,
        internalCourtName: court?.name || null,
      };
    });
  }

  private static async loadScript(
    scriptName: string
  ): Promise<ClubIntegrationFunction> {
    if (this.scriptCache.has(scriptName)) {
      return this.scriptCache.get(scriptName)!;
    }

    const scriptPath = path.join(SCRIPTS_DIR, `${scriptName}.js`);

    if (!fs.existsSync(scriptPath)) {
      throw new ApiError(404, `Integration script not found: ${scriptName}`);
    }

    try {
      const scriptModule = await import(scriptPath);

      // Try to get the function - handle different export patterns
      // Scripts can export: module.exports = function, module.exports.default, module.exports.getSlots, etc.
      let scriptFunction: ClubIntegrationFunction;
      
      if (typeof scriptModule === 'function') {
        // Direct function export: module.exports = function
        scriptFunction = scriptModule;
      } else if (scriptModule.default && typeof scriptModule.default === 'function') {
        // Default export: module.exports.default = function
        scriptFunction = scriptModule.default;
      } else if (scriptModule.getSlots && typeof scriptModule.getSlots === 'function') {
        // Named export: module.exports.getSlots = function
        scriptFunction = scriptModule.getSlots;
      } else {
        // Try script name as property (for subfolder names like "NoviSad/crs", use "crs")
        const scriptBaseName = scriptName.split('/').pop() || scriptName;
        if (scriptModule[scriptBaseName] && typeof scriptModule[scriptBaseName] === 'function') {
          scriptFunction = scriptModule[scriptBaseName];
        } else {
          throw new ApiError(
            500,
            `Invalid script format: ${scriptName}. Must export a function.`
          );
        }
      }

      if (typeof scriptFunction !== 'function') {
        throw new ApiError(
          500,
          `Invalid script format: ${scriptName}. Must export a function.`
        );
      }

      this.scriptCache.set(scriptName, scriptFunction);

      return scriptFunction;
    } catch (error) {
      console.error(`Error loading integration script ${scriptName}:`, error);
      throw new ApiError(500, `Failed to load integration script: ${scriptName}`);
    }
  }

  static clearScriptCache(scriptName?: string) {
    if (scriptName) {
      this.scriptCache.delete(scriptName);
    } else {
      this.scriptCache.clear();
    }
  }

  static clearResultCache(clubId?: string) {
    if (clubId) {
      const keysToDelete: string[] = [];
      this.resultCache.forEach((_, key) => {
        if (key.startsWith(`${clubId}-`)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach((key) => this.resultCache.delete(key));
    } else {
      this.resultCache.clear();
    }
  }

  static async hasValidCache(
    clubId: string,
    startDate: Date,
    endDate: Date,
    duration: number
  ): Promise<boolean> {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
    });

    if (!club) {
      return false;
    }

    const isDateIndependent = club.integrationScriptDateIndependent ?? false;
    const cacheKey = this.getCacheKey(clubId, startDate, endDate, duration, isDateIndependent);
    const cached = this.resultCache.get(cacheKey);
    const isInvalidating = this.invalidatingCacheKeys.has(cacheKey);

    console.log(`[hasValidCache] clubId: ${clubId}, cacheKey: ${cacheKey}, isDateIndependent: ${isDateIndependent}, cached: ${cached ? `found (${cached.result.length} slots, age: ${Date.now() - cached.timestamp.getTime()}ms)` : 'not found'}, isInvalidating: ${isInvalidating}`);

    if (!cached) {
      return false;
    }

    const age = Date.now() - cached.timestamp.getTime();
    return age < CACHE_DURATION_MS;
  }

  static isCacheInvalidating(
    clubId: string,
    startDate: Date,
    endDate: Date,
    duration: number
  ): Promise<boolean> {
    return new Promise(async (resolve) => {
      const club = await prisma.club.findUnique({
        where: { id: clubId },
      });

      if (!club) {
        resolve(false);
        return;
      }

      const isDateIndependent = club.integrationScriptDateIndependent ?? false;
      const cacheKey = this.getCacheKey(clubId, startDate, endDate, duration, isDateIndependent);
      resolve(this.invalidatingCacheKeys.has(cacheKey));
    });
  }

  static async getCachedResult(
    clubId: string,
    startDate: Date,
    endDate: Date,
    duration: number
  ): Promise<CachedResult | null> {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
    });

    if (!club) {
      return null;
    }

    const isDateIndependent = club.integrationScriptDateIndependent ?? false;
    const cacheKey = this.getCacheKey(
      clubId,
      startDate,
      endDate,
      duration,
      isDateIndependent
    );
    const cached = this.resultCache.get(cacheKey) || null;
    
    console.log(`[getCachedResult] clubId: ${clubId}, cacheKey: ${cacheKey}, isDateIndependent: ${isDateIndependent}, cached: ${cached ? `found (${cached.result.length} slots)` : 'not found'}`);
    console.log(`[getCachedResult] All cache keys:`, Array.from(this.resultCache.keys()));
    
    return cached;
  }

  static invalidateCacheInBackground(
    clubId: string,
    startDate: Date,
    endDate: Date,
    duration: number
  ): void {
    setImmediate(async () => {
      let cacheKey: string | null = null;
      try {
        const club = await prisma.club.findUnique({
          where: { id: clubId },
          include: { courts: true },
        });

        if (!club || !club.integrationScriptName) {
          return;
        }

        const isDateIndependent = club.integrationScriptDateIndependent ?? false;
        cacheKey = this.getCacheKey(clubId, startDate, endDate, duration, isDateIndependent);

        if (this.invalidatingCacheKeys.has(cacheKey)) {
          console.log(`[invalidateCacheInBackground] Cache key ${cacheKey} is already being invalidated, skipping`);
          return;
        }

        this.invalidatingCacheKeys.add(cacheKey);

        const script = await this.loadScript(club.integrationScriptName);

        const params: ClubIntegrationParams = {
          startDate,
          endDate,
          duration,
          clubConfig: club.integrationConfig as Record<string, any> | undefined,
        };

        const result = await script(params);

        console.log(`[invalidateCacheInBackground] Setting cache with key: ${cacheKey}, slots count: ${result.slots.length}`);
        this.resultCache.set(cacheKey, {
          result: result.slots,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error(`Error invalidating cache in background for club ${clubId}:`, error);
      } finally {
        if (cacheKey) {
          this.invalidatingCacheKeys.delete(cacheKey);
        }
      }
    });
  }
}

