import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  registerToken,
  removeToken,
  removeAllTokens,
  renewToken,
  getTokens,
  sendTestNotification
} from '../controllers/push.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

router.use(authenticate);

router.post(
  '/tokens',
  validate([
    body('token').isString().notEmpty().withMessage('Token is required'),
    body('platform').isIn(['IOS', 'ANDROID', 'WEB']).withMessage('Invalid platform'),
    body('deviceId').optional().isString()
  ]),
  registerToken
);

router.delete(
  '/tokens/:token',
  validate([
    param('token').isString().notEmpty().withMessage('Token is required')
  ]),
  removeToken
);

router.delete('/tokens', removeAllTokens);

router.post(
  '/tokens/renew',
  validate([
    body('oldToken').isString().notEmpty().withMessage('Old token is required'),
    body('newToken').isString().notEmpty().withMessage('New token is required')
  ]),
  renewToken
);

router.get('/tokens', getTokens);

router.post('/test', sendTestNotification);

export default router;
