import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { WeatherForecastService } from '../services/weatherForecast.service';

export const getWeatherPreview = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { cityId, startTime, endTime, scope } = req.query;

  if (typeof cityId !== 'string' || !cityId) {
    throw new ApiError(400, 'cityId is required');
  }
  if (typeof startTime !== 'string' || typeof endTime !== 'string') {
    throw new ApiError(400, 'startTime and endTime are required');
  }

  const forecast = await WeatherForecastService.getWindowForCity({
    cityId,
    startTime,
    endTime,
    timeIsSet: true,
    scope: scope === 'day' ? 'day' : 'game',
  });

  res.json({
    success: true,
    data: forecast,
    serverTime: new Date().toISOString(),
  });
});

export const getGameWeather = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const forecast = await WeatherForecastService.getWindowForGame(id, req.query.scope === 'day' ? 'day' : 'game');

  res.json({
    success: true,
    data: forecast,
    serverTime: new Date().toISOString(),
  });
});
