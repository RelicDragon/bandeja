import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { GameSubscriptionService } from '../services/gameSubscription.service';

export const getSubscriptions = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new Error('User ID not found');
  }

  const subscriptions = await GameSubscriptionService.getUserSubscriptions(req.userId);

  res.json({
    success: true,
    data: subscriptions,
  });
});

export const createSubscription = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new Error('User ID not found');
  }

  const subscription = await GameSubscriptionService.createSubscription(req.userId, req.body);

  res.status(201).json({
    success: true,
    data: subscription,
  });
});

export const updateSubscription = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new Error('User ID not found');
  }

  const { id } = req.params;
  const subscription = await GameSubscriptionService.updateSubscription(id, req.userId, req.body);

  res.json({
    success: true,
    data: subscription,
  });
});

export const deleteSubscription = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new Error('User ID not found');
  }

  const { id } = req.params;
  await GameSubscriptionService.deleteSubscription(id, req.userId);

  res.json({
    success: true,
    message: 'Subscription deleted successfully',
  });
});

