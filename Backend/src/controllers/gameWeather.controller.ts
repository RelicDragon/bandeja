/**
 * PRD 357 — weather alert state, "keep as planned", and indoor alternatives.
 *
 * None of these endpoints mutates courts. Applying a court change goes through
 * the existing edit path (`PUT /games/:id` + `POST /game-courts/game/:id`) so
 * there is exactly one place that validates a court against a game.
 */
import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import {
  getWeatherAlertState,
  keepAsPlanned,
  noteMovedIndoor,
} from '../services/weather/weatherAlert.service';
import { getIndoorAlternatives } from '../services/weather/indoorAlternatives.service';

export const getGameWeatherAlert = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const data = await getWeatherAlertState(id);
  res.json({ success: true, data });
});

export const keepGameAsPlanned = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (!req.userId) throw new ApiError(401, 'errors.auth.unauthorized');
  const data = await keepAsPlanned(id, req.userId);
  res.json({ success: true, data });
});

export const noteGameMovedIndoor = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (!req.userId) throw new ApiError(401, 'errors.auth.unauthorized');
  const courtId = typeof req.body?.courtId === 'string' ? req.body.courtId : '';
  if (!courtId) throw new ApiError(400, 'errors.weather.invalidAction');
  const data = await noteMovedIndoor(id, req.userId, courtId);
  res.json({ success: true, data });
});

export const getGameIndoorAlternatives = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const data = await getIndoorAlternatives(id);
  res.json({ success: true, data });
});
