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

router.post(
  '/auth',
  authenticate,
  validate([
    body('phone').notEmpty().withMessage('Phone is required'),
    body('code').notEmpty().withMessage('Code is required'),
    body('temporalToken').notEmpty().withMessage('Temporal token is required'),
    body('countryCode').notEmpty().withMessage('Country code is required'),
  ]),
  lundaController.lundaAuth
);

router.post(
  '/profile',
  authenticate,
  lundaController.lundaGetProfile
);

router.get(
  '/status',
  authenticate,
  lundaController.lundaGetStatus
);

router.put(
  '/captcha',
  authenticate,
  validate([
    body('countryCode').notEmpty().withMessage('Country code is required'),
    body('phone').notEmpty().withMessage('Phone is required'),
  ]),
  lundaController.lundaGetCaptcha
);

router.post(
  '/send-code',
  authenticate,
  validate([
    body('countryCode').notEmpty().withMessage('Country code is required'),
    body('phone').notEmpty().withMessage('Phone is required'),
    body('answer').notEmpty().withMessage('Answer is required'),
    body('method').isIn(['TELEGRAM', 'SMS']).withMessage('Method must be TELEGRAM or SMS'),
    body('ticket').notEmpty().withMessage('Ticket is required'),
  ]),
  lundaController.lundaSendCode
);

export default router;
