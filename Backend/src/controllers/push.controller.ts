import { Request, Response } from 'express';
import { PushTokenService } from '../services/push/push-token.service';
import { PushPlatform } from '@prisma/client';
import { asyncHandler } from '../utils/asyncHandler';
import pushNotificationService from '../services/push/push-notification.service';
import { NotificationType } from '../types/notifications.types';

export const registerToken = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { token, platform, deviceId } = req.body;

  if (!token || !platform) {
    return res.status(400).json({
      success: false,
      message: 'Token and platform are required'
    });
  }

  if (!Object.values(PushPlatform).includes(platform)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid platform'
    });
  }

  const pushToken = await PushTokenService.registerToken(userId, token, platform, deviceId);

  res.json({
    success: true,
    data: pushToken
  });
});

export const removeToken = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { token } = req.params;

  const result = await PushTokenService.removeToken(userId, token);

  res.json({
    success: result.success,
    message: result.success ? 'Token removed successfully' : 'Failed to remove token'
  });
});

export const removeAllTokens = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;

  const result = await PushTokenService.removeAllUserTokens(userId);

  res.json({
    success: true,
    message: `Removed ${result.deleted} token(s)`,
    data: { deleted: result.deleted }
  });
});

export const renewToken = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { oldToken, newToken } = req.body;

  if (!oldToken || !newToken) {
    return res.status(400).json({
      success: false,
      message: 'Both oldToken and newToken are required'
    });
  }

  const pushToken = await PushTokenService.renewToken(oldToken, newToken, userId);

  if (!pushToken) {
    return res.status(404).json({
      success: false,
      message: 'Token not found'
    });
  }

  res.json({
    success: true,
    data: pushToken
  });
});

export const getTokens = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const platform = req.query.platform as PushPlatform | undefined;

  const tokens = await PushTokenService.getUserTokens(userId, platform);

  res.json({
    success: true,
    data: tokens
  });
});

export const sendTestNotification = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;

  console.log(`[TEST] Sending test notification to user ${userId}`);

  const payload = {
    title: 'Test Notification',
    body: 'This is a test push notification from Bandeja',
    type: NotificationType.GAME_SYSTEM_MESSAGE,
    sound: 'default'
  };

  const sent = await pushNotificationService.sendNotificationToUser(userId, payload);

  res.json({
    success: true,
    message: `Test notification sent to ${sent} device(s)`,
    data: {
      devicesSent: sent,
      payload
    }
  });
});
