import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import * as goodsController from '../controllers/goods.controller';

const router = Router();

router.post(
  '/',
  authenticate,
  validate([
    body('name').notEmpty().withMessage('Name is required'),
    body('price').isInt({ min: 0 }).withMessage('Price must be a non-negative integer'),
  ]),
  goodsController.createGoods
);

router.get('/', authenticate, goodsController.getAllGoods);

router.get('/:id', authenticate, goodsController.getGoodsById);

router.put(
  '/:id',
  authenticate,
  validate([
    body('name').optional().notEmpty().withMessage('Name cannot be empty'),
    body('price').optional().isInt({ min: 0 }).withMessage('Price must be a non-negative integer'),
  ]),
  goodsController.updateGoods
);

router.delete('/:id', authenticate, goodsController.deleteGoods);

export default router;

