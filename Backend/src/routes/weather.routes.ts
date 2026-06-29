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
    query('scope').optional().isIn(['game', 'day']).withMessage('scope must be game or day'),
  ]),
  getWeatherPreview,
);

export default router;
