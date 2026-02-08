import { Router } from 'express';
import { authenticate, optionalAuth } from '../middleware/auth';
import * as marketItemController from '../controllers/marketItem.controller';

const router = Router();

router.get('/categories', marketItemController.getMarketCategories);

router.post('/', authenticate, marketItemController.createMarketItem);
router.get('/', optionalAuth, marketItemController.getMarketItems);
router.get('/:id', optionalAuth, marketItemController.getMarketItemById);
router.put('/:id', authenticate, marketItemController.updateMarketItem);
router.post('/:id/withdraw', authenticate, marketItemController.withdrawMarketItem);
router.post('/:id/join-chat', authenticate, marketItemController.joinMarketItemChat);
router.post('/:id/leave-chat', authenticate, marketItemController.leaveMarketItemChat);

export default router;
