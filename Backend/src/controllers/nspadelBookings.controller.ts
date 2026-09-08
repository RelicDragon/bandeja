import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import * as nspadelBookingsService from '../services/nspadel/nspadelBookings.service';

function requiredQuery(value: unknown, name: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    throw new ApiError(400, `${name} is required`);
  }
  return trimmed;
}

function requiredBodyField(body: Record<string, unknown>, name: string): string {
  const value = body[name];
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    throw new ApiError(400, `${name} is required`);
  }
  return trimmed;
}

export const getAvailability = asyncHandler(async (req: AuthRequest, res: Response) => {
  const clubId = requiredQuery(req.query.clubId, 'clubId');
  const date = requiredQuery(req.query.date, 'date');
  const rawDuration = typeof req.query.durationMinutes === 'string' ? req.query.durationMinutes.trim() : '';
  const durationMinutes = rawDuration ? Number(rawDuration) : 60;
  const payload = await nspadelBookingsService.getNspadelAvailability(clubId, date, durationMinutes);
  res.json({ success: true, data: payload });
});

export const createBooking = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const result = await nspadelBookingsService.createNspadelBooking({
    clubId: requiredBodyField(body, 'clubId'),
    userId: req.userId!,
    courtId: requiredBodyField(body, 'courtId'),
    date: requiredBodyField(body, 'date'),
    startTime: requiredBodyField(body, 'startTime'),
    endTime: requiredBodyField(body, 'endTime'),
  });
  res.status(201).json({ success: true, data: result });
});
