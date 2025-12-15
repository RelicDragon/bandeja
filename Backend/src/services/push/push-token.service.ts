import prisma from '../../config/database';
import { PushPlatform } from '@prisma/client';

export class PushTokenService {
  static async registerToken(
    userId: string,
    token: string,
    platform: PushPlatform,
    deviceId?: string
  ) {
    const existingToken = await prisma.pushToken.findUnique({
      where: {
        userId_token: {
          userId,
          token
        }
      }
    });

    if (existingToken) {
      return await prisma.pushToken.update({
        where: { id: existingToken.id },
        data: {
          platform,
          deviceId,
          updatedAt: new Date()
        }
      });
    }

    return await prisma.pushToken.create({
      data: {
        userId,
        token,
        platform,
        deviceId
      }
    });
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
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  }

  static async removeAllUserTokens(userId: string) {
    const result = await prisma.pushToken.deleteMany({
      where: { userId }
    });
    return { deleted: result.count };
  }

  static async getUserTokens(userId: string, platform?: PushPlatform) {
    const where: any = { userId };
    if (platform) {
      where.platform = platform;
    }

    return await prisma.pushToken.findMany({
      where,
      orderBy: { updatedAt: 'desc' }
    });
  }

  static async renewToken(oldToken: string, newToken: string, userId: string) {
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

    return await prisma.pushToken.update({
      where: { id: existingToken.id },
      data: {
        token: newToken,
        updatedAt: new Date()
      }
    });
  }

  static async removeInvalidToken(token: string) {
    try {
      await prisma.pushToken.deleteMany({
        where: { token }
      });
    } catch (error) {
      console.error('Error removing invalid token:', error);
    }
  }
}
