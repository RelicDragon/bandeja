import prisma from '../../config/database';
import { PushPlatform } from '@prisma/client';
import { NotificationPreferenceService } from '../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';

export class PushTokenService {
  static async registerToken(
    userId: string,
    token: string,
    platform: PushPlatform,
    deviceId?: string,
    appVersion?: string | null,
    appBuild?: number | null
  ) {
    const versionPayload = { appVersion: appVersion ?? undefined, appBuild: appBuild ?? undefined };
    console.log(`[PushTokenService] Registering token for user ${userId}:`, {
      platform,
      deviceId,
      ...versionPayload,
      tokenPreview: token.substring(0, 20) + '...'
    });

    const versionData = {
      ...(appVersion !== undefined && appVersion !== null && { appVersion }),
      ...(appBuild !== undefined && appBuild !== null && appBuild > 0 && { appBuild })
    };

    try {
      const result = await prisma.pushToken.upsert({
        where: {
          userId_token: { userId, token }
        },
        create: {
          userId,
          token,
          platform,
          deviceId,
          ...versionData
        },
        update: {
          platform,
          deviceId,
          ...versionData,
          updatedAt: new Date()
        }
      });
      await NotificationPreferenceService.ensurePreferenceForChannel(userId, NotificationChannelType.PUSH);
      console.log(`[PushTokenService] ✅ Token upserted successfully`);
      return result;
    } catch (error) {
      console.error(`[PushTokenService] ❌ Error registering token:`, error);
      throw error;
    }
  }

  static async removeToken(userId: string, token: string) {
    try {
      await prisma.pushToken.delete({
        where: {
          userId_token: {
            userId,
            token
          }
        }
      });
      const remaining = await prisma.pushToken.count({ where: { userId } });
      if (remaining === 0) {
        await NotificationPreferenceService.deletePreferenceForChannel(userId, NotificationChannelType.PUSH);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  }

  static async removeAllUserTokens(userId: string) {
    const result = await prisma.pushToken.deleteMany({
      where: { userId }
    });
    if (result.count > 0) {
      await NotificationPreferenceService.deletePreferenceForChannel(userId, NotificationChannelType.PUSH);
    }
    return { deleted: result.count };
  }

  static async getUserTokens(userId: string, platform?: PushPlatform) {
    const where: any = { userId };
    if (platform) {
      where.platform = platform;
    }

    console.log(`[PushTokenService] Getting tokens for user ${userId}, platform: ${platform || 'ALL'}`);
    
    try {
      const tokens = await prisma.pushToken.findMany({
        where,
        orderBy: { updatedAt: 'desc' }
      });
      
      console.log(`[PushTokenService] Found ${tokens.length} token(s):`, 
        tokens.map(t => ({ 
          platform: t.platform, 
          deviceId: t.deviceId,
          appVersion: t.appVersion,
          appBuild: t.appBuild,
          tokenPreview: t.token.substring(0, 20) + '...',
          updatedAt: t.updatedAt
        }))
      );
      
      return tokens;
    } catch (error) {
      console.error(`[PushTokenService] ❌ Error fetching tokens for user ${userId}:`, error);
      throw error;
    }
  }

  static async renewToken(
    oldToken: string,
    newToken: string,
    userId: string,
    appVersion?: string | null,
    appBuild?: number | null
  ) {
    const existingToken = await prisma.pushToken.findUnique({
      where: {
        userId_token: {
          userId,
          token: oldToken
        }
      }
    });

    if (!existingToken) {
      return null;
    }

    const versionData: { appVersion?: string; appBuild?: number } = {};
    if (appVersion !== undefined && appVersion !== null) versionData.appVersion = appVersion;
    if (appBuild !== undefined && appBuild !== null && appBuild > 0) versionData.appBuild = appBuild;

    return await prisma.pushToken.update({
      where: { id: existingToken.id },
      data: {
        token: newToken,
        ...versionData,
        updatedAt: new Date()
      }
    });
  }

  static async removeInvalidToken(token: string) {
    console.log(`[PushTokenService] Removing invalid token: ${token.substring(0, 20)}...`);
    try {
      const existing = await prisma.pushToken.findFirst({ where: { token }, select: { userId: true } });
      const result = await prisma.pushToken.deleteMany({ where: { token } });
      if (result.count > 0 && existing) {
        const remaining = await prisma.pushToken.count({ where: { userId: existing.userId } });
        if (remaining === 0) {
          await NotificationPreferenceService.deletePreferenceForChannel(existing.userId, NotificationChannelType.PUSH);
        }
      }
      console.log(`[PushTokenService] ✅ Removed ${result.count} invalid token(s)`);
    } catch (error) {
      console.error('[PushTokenService] ❌ Error removing invalid token:', error);
    }
  }
}
