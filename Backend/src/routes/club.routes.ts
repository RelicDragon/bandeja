import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { optionalAuth } from '../middleware/auth';
import * as clubController from '../controllers/club.controller';

const router = Router();

router.get('/city/:cityId', optionalAuth, clubController.getClubsByCity);

router.get('/:id', optionalAuth, clubController.getClubById);

router.post(
  '/',
  validate([
    body('name').notEmpty().withMessage('Name is required'),
    body('address').notEmpty().withMessage('Address is required'),
    body('cityId').notEmpty().withMessage('City ID is required'),
  ]),
  clubController.createClub
);

router.put('/:id', clubController.updateClub);

export default router;

