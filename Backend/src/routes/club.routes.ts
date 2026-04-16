import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { optionalAuth, requireAdmin } from '../middleware/auth';
import * as clubController from '../controllers/club.controller';

const router = Router();

router.get('/map', optionalAuth, clubController.getClubsForMap);
router.get('/city/:cityId', optionalAuth, clubController.getClubsByCity);

router.get('/:id', optionalAuth, clubController.getClubById);

router.post(
  '/',
  requireAdmin,
  validate([
    body('name').notEmpty().withMessage('Name is required'),
    body('address').notEmpty().withMessage('Address is required'),
    body('cityId').notEmpty().withMessage('City ID is required'),
  ]),
  clubController.createClub
);

router.put('/:id', requireAdmin, clubController.updateClub);

export default router;

