import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { WeatherForecastService, type WeatherWindowScope } from '../services/weatherForecast.service';
import { WeatherDayArchiveService } from '../services/weatherDayArchive.service';

function parseWeatherWindowScope(value: unknown): WeatherWindowScope {
  if (value === 'day') return 'day';
  if (value === 'forecast') return 'forecast';
  return 'game';
}

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
    scope: parseWeatherWindowScope(scope),
  });

  res.json({
    success: true,
    data: forecast,
    serverTime: new Date().toISOString(),
  });
});

export const getWeatherDay = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { cityId, date } = req.query;

  if (typeof cityId !== 'string' || !cityId) {
    throw new ApiError(400, 'cityId is required');
  }
  if (typeof date !== 'string' || !date) {
    throw new ApiError(400, 'date is required');
  }

  const day = await WeatherDayArchiveService.getDay(cityId, date);

  res.json({
    success: true,
    data: day,
    serverTime: new Date().toISOString(),
  });
});

export const getGameWeather = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const forecast = await WeatherForecastService.getWindowForGame(id, parseWeatherWindowScope(req.query.scope));

  res.json({
    success: true,
    data: forecast,
    serverTime: new Date().toISOString(),
  });
});
