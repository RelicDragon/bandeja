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
router.post('/:id/reserve', authenticate, marketItemController.reserveMarketItem);
router.post('/:id/join-chat', authenticate, marketItemController.joinMarketItemChat);
router.post('/:id/leave-chat', authenticate, marketItemController.leaveMarketItemChat);
router.post('/:id/express-interest', authenticate, marketItemController.expressInterest);
router.get('/:id/seller-chats', authenticate, marketItemController.getSellerChats);
router.get('/:id/buyer-chat', authenticate, marketItemController.getBuyerChat);
router.post('/:id/buyer-chat', authenticate, marketItemController.createBuyerChat);

export default router;
