import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import * as lundaController from '../controllers/lunda.controller';

const router = Router();

router.post(
  '/sync-profile',
  authenticate,
  validate([
    body('phone').notEmpty().withMessage('Phone is required'),
    body('gender').optional().isIn(['MALE', 'FEMALE', 'PREFER_NOT_TO_SAY']).withMessage('Invalid gender'),
    body('level').optional().isFloat({ min: 0 }).withMessage('Level must be a positive number'),
    body('preferredCourtSideLeft').optional().isBoolean().withMessage('preferredCourtSideLeft must be boolean'),
    body('preferredCourtSideRight').optional().isBoolean().withMessage('preferredCourtSideRight must be boolean'),
    body('metadata').notEmpty().withMessage('Lunda metadata is required'),
  ]),
  lundaController.syncLundaProfile
);

export default router;
