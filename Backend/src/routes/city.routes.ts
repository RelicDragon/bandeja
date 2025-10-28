import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { optionalAuth } from '../middleware/auth';
import * as cityController from '../controllers/city.controller';

const router = Router();

router.get('/meta/countries', cityController.getCountries);

router.get('/meta/timezones', cityController.getTimezones);

router.get('/', optionalAuth, cityController.getAllCities);

router.get('/:id', optionalAuth, cityController.getCityById);

router.post(
  '/',
  validate([
    body('name').notEmpty().withMessage('City name is required'),
    body('country').notEmpty().withMessage('Country is required'),
    body('timezone').optional(),
  ]),
  cityController.createCity
);

export default router;

