import { Router } from 'express';
import { query } from 'express-validator';
import { validate } from '../middleware/validate';
import { getWeatherPreview, getWeatherDay } from '../controllers/weather.controller';

const router = Router();

router.get(
  '/day',
  validate([
    query('cityId').isString().notEmpty().withMessage('cityId is required'),
    query('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date must be YYYY-MM-DD'),
  ]),
  getWeatherDay,
);

router.get(
  '/preview',
  validate([
    query('cityId').isString().notEmpty().withMessage('cityId is required'),
    query('startTime').isISO8601().withMessage('Valid startTime is required'),
    query('endTime').isISO8601().withMessage('Valid endTime is required'),
    query('scope').optional().isIn(['game', 'day', 'forecast']).withMessage('scope must be game, day, or forecast'),
  ]),
  getWeatherPreview,
);

export default router;
