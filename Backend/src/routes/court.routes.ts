import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { optionalAuth } from '../middleware/auth';
import * as courtController from '../controllers/court.controller';

const router = Router();

router.get('/club/:clubId', optionalAuth, courtController.getCourtsByClub);

router.get('/:id', optionalAuth, courtController.getCourtById);

router.post(
  '/',
  validate([
    body('name').notEmpty().withMessage('Name is required'),
    body('clubId').notEmpty().withMessage('Club ID is required'),
  ]),
  courtController.createCourt
);

router.put('/:id', courtController.updateCourt);
router.delete('/:id', courtController.deleteCourt);

export default router;

