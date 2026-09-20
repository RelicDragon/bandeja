/**
 * PRD 355 — goods shop (catalogue, purchase, gift, equip).
 *
 * Mounted at `/api/shop` from `routes/index.ts`. The admin catalogue surface
 * lives in `goods.routes.ts` behind `requireAdmin`.
 *
 * `/me/goods/:goodsId/equip` deliberately keeps the path shape the PRD names, so
 * mounting this router a second time under `/users` would expose the documented
 * `PUT /users/me/goods/:id/equip` verbatim.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth';
import { requireShopEnabled } from '../middleware/requireShopEnabled';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import * as shopController from '../controllers/shop.controller';

const router = Router();

/** Spending coins is the one thing worth throttling hard. */
const purchaseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  message: {
    success: false,
    message: 'Too many purchase attempts, please try again in a minute.',
    code: 'shop.rateLimit',
  },
});

const equipLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  message: {
    success: false,
    message: 'Too many changes, please slow down.',
    code: 'shop.rateLimit',
  },
});

router.use(requireShopEnabled);

router.get('/catalog', authenticate, shopController.getCatalog);
router.get('/equipped', authenticate, shopController.getEquippedForUsers);
router.get('/me/goods', authenticate, shopController.getCollection);
router.get('/items/:goodsId', authenticate, shopController.getItem);

router.post('/purchase', authenticate, purchaseLimiter, shopController.purchase);
router.put('/me/goods/:goodsId/equip', authenticate, equipLimiter, shopController.equipGoods);
router.put('/me/goods/:goodsId/unequip', authenticate, equipLimiter, shopController.unequipGoods);

export default router;
