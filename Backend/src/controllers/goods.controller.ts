import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { GoodsService } from '../services/goods.service';

export const createGoods = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, price } = req.body;

  const goods = await GoodsService.createGoods(name, price);

  res.status(201).json({
    success: true,
    data: goods,
  });
});

export const getAllGoods = asyncHandler(async (req: AuthRequest, res: Response) => {
  const goods = await GoodsService.getAllGoods();

  res.json({
    success: true,
    data: goods,
  });
});

export const getGoodsById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const goods = await GoodsService.getGoodsById(id);

  res.json({
    success: true,
    data: goods,
  });
});

export const updateGoods = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, price } = req.body;

  const goods = await GoodsService.updateGoods(id, name, price);

  res.json({
    success: true,
    data: goods,
  });
});

export const deleteGoods = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  await GoodsService.deleteGoods(id);

  res.json({
    success: true,
    message: 'Goods deleted successfully',
  });
});

