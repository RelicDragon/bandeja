import { Router } from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import * as bugController from '../controllers/bug.controller';
import { BUG_TYPE_VALUES } from '../services/bug/bugPriority';

const router = Router();

router.post(
  '/',
  authenticate,
  validate([
    body('text').notEmpty().withMessage('Bug text is required'),
    body('bugType').isIn(BUG_TYPE_VALUES).withMessage('Valid bug type is required'),
    body('priority').optional().isInt({ min: -2, max: 5 }).withMessage('Priority must be between -2 and 5'),
  ]),
  bugController.createBug
);

router.get('/', authenticate, bugController.getBugs);
router.get(
  '/:id',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Bug ID is required'),
  ]),
  bugController.getBugById
);

router.put(
  '/:id',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Bug ID is required'),
    body('status').optional().isIn(['CREATED', 'CONFIRMED', 'IN_PROGRESS', 'TEST', 'FINISHED', 'ARCHIVED']).withMessage('Valid status is required'),
    body('bugType').optional().isIn(BUG_TYPE_VALUES).withMessage('Valid bug type is required'),
    body('priority').optional().isInt({ min: -2, max: 5 }).withMessage('Priority must be between -2 and 5'),
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

router.post(
  '/:id/join-chat',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Bug ID is required'),
  ]),
  bugController.joinBugChat
);

router.post(
  '/:id/leave-chat',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Bug ID is required'),
  ]),
  bugController.leaveBugChat
);

export default router;
