import { Router } from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import * as bugController from '../controllers/bug.controller';

const router = Router();

router.post(
  '/',
  authenticate,
  validate([
    body('text').notEmpty().withMessage('Bug text is required'),
    body('bugType').isIn(['BUG', 'CRITICAL', 'SUGGESTION', 'QUESTION']).withMessage('Valid bug type is required'),
  ]),
  bugController.createBug
);

router.get('/', authenticate, bugController.getBugs);

router.put(
  '/:id',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Bug ID is required'),
    body('status').isIn(['CREATED', 'CONFIRMED', 'IN_PROGRESS', 'TEST', 'FINISHED', 'ARCHIVED']).withMessage('Valid status is required'),
  ]),
  bugController.updateBug
);

router.delete(
  '/:id',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Bug ID is required'),
  ]),
  bugController.deleteBug
);

export default router;
