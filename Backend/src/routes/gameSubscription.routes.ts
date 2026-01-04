import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getSubscriptions,
  createSubscription,
  updateSubscription,
  deleteSubscription,
} from '../controllers/gameSubscription.controller';

const router = Router();

router.use(authenticate);

router.get('/', getSubscriptions);
router.post('/', createSubscription);
router.put('/:id', updateSubscription);
router.delete('/:id', deleteSubscription);

export default router;

