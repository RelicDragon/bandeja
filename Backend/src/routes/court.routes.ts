import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate, optionalAuth } from '../middleware/auth';
import * as courtController from '../controllers/court.controller';

const router = Router();

router.get('/club/:clubId', optionalAuth, courtController.getCourtsByClub);

router.get('/:id', optionalAuth, courtController.getCourtById);

router.post(
  '/',
  authenticate,
  validate([
    body('name').notEmpty().withMessage('Name is required'),
    body('clubId').notEmpty().withMessage('Club ID is required'),
  ]),
  courtController.createCourt
);

router.put('/:id', authenticate, courtController.updateCourt);
router.delete('/:id', authenticate, courtController.deleteCourt);

export default router;

