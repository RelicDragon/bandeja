/**
 * PRD 355 — the **admin** catalogue surface for shop goods.
 *
 * Security: every route here, read and write, is behind `requireAdmin`.
 * Before PRD 355 the `POST`/`PUT`/`DELETE` routes carried `authenticate` only,
 * which let any signed-in player create, reprice or delete catalogue items, and
 * the unfiltered `GET` leaked inactive/unreleased items. Player-facing reads
 * belong on `/api/shop` (see `shop.routes.ts`); nothing on this router is for
 * players.
 */
import { Router } from 'express';
import { requireAdmin } from '../middleware/auth';
import * as goodsController from '../controllers/goods.controller';

const router = Router();

router.get('/', requireAdmin, goodsController.getAllGoods);
router.get('/:id', requireAdmin, goodsController.getGoodsById);

router.post('/', requireAdmin, goodsController.createGoods);
router.put('/:id', requireAdmin, goodsController.updateGoods);
router.patch('/:id', requireAdmin, goodsController.updateGoods);
router.delete('/:id', requireAdmin, goodsController.deleteGoods);

router.get('/:id/withdraw-summary', requireAdmin, goodsController.getWithdrawSummary);
router.post('/:id/withdraw', requireAdmin, goodsController.withdrawGoods);

router.post(
  '/:id/preview',
  requireAdmin,
  goodsController.goodsPreviewUpload,
  goodsController.uploadGoodsPreview,
);

export default router;
