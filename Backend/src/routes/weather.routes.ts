import { Router } from 'express';
import { query } from 'express-validator';
import { validate } from '../middleware/validate';
import { getWeatherPreview } from '../controllers/weather.controller';

const router = Router();

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
