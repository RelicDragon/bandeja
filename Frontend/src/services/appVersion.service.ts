import axios from 'axios';
import { App } from '@capacitor/app';
import { isCapacitor, getCapacitorPlatform } from '@/utils/capacitor';

const API_BASE_URL = import.meta.env.PROD ? 'https://bandeja.me/api' : '/api';

export type VersionCheckStatus = 'ok' | 'optional_update' | 'blocking_update';

export interface VersionCheckResult {
  status: VersionCheckStatus;
  minVersion?: string;
  message?: string;
}

export interface AppInfo {
  version: string;
  buildNumber: number;
  platform: string;
}

const CACHE_KEY = 'padelpulse_app_version_check';
const CACHE_DURATION = 60 * 60 * 1000;

export class AppVersionService {
  static async getAppInfo(): Promise<AppInfo | null> {
    if (!isCapacitor()) {
      return null;
    }

    try {
      const info = await App.getInfo();
      const platform = getCapacitorPlatform();
      const buildNumber = parseInt(info.build);
      
      if (isNaN(buildNumber) || buildNumber <= 0) {
        console.error('Invalid build number:', info.build);
        return null;
      }
      
      return {
        version: info.version,
        buildNumber,
        platform: platform || 'unknown',
      };
    } catch (error) {
      console.error('Failed to get app info:', error);
      return null;
    }
  }

  static async checkVersion(): Promise<VersionCheckResult> {
    const appInfo = await this.getAppInfo();

    if (!appInfo) {
      return { status: 'ok' };
    }

    const cached = this.getCachedCheck(appInfo.buildNumber);
    if (cached) {
      return cached;
    }

    try {
      const response = await axios.get<{ success: boolean; data: VersionCheckResult }>(
        `${API_BASE_URL}/app/version-check`,
        {
          params: {
            platform: appInfo.platform,
            buildNumber: appInfo.buildNumber,
          },
          timeout: 5000,
        }
      );

      if (response.data.success) {
        const result = response.data.data;
        this.setCachedCheck(result, appInfo.buildNumber);
        return result;
      }

      return { status: 'ok' };
    } catch (error) {
      console.error('Failed to check app version:', error);
      return { status: 'ok' };
    }
  }

  private static getCachedCheck(currentBuildNumber: number): VersionCheckResult | null {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;

      const { result, timestamp, buildNumber } = JSON.parse(cached);
      
      if (buildNumber !== currentBuildNumber) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }
      
      if (Date.now() - timestamp > CACHE_DURATION) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }

      return result;
    } catch {
      return null;
    }
  }

  private static setCachedCheck(result: VersionCheckResult, buildNumber: number): void {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          result,
          buildNumber,
          timestamp: Date.now(),
        })
      );
    } catch (error) {
      console.error('Failed to cache version check:', error);
    }
  }

  static clearCache(): void {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }

  static getStoreUrl(platform: string): string {
    if (platform === 'ios') {
      return 'https://apps.apple.com/app/bandeja/id6756632318';
    } else if (platform === 'android') {
      return 'https://play.google.com/store/apps/details?id=com.funified.bandeja';
    }
    return '';
  }
}
