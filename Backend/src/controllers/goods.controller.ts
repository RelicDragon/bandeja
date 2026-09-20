/**
 * PRD 355 — admin catalogue controller. Every route is behind `requireAdmin`
 * (see `routes/goods.routes.ts`).
 */
import { Response } from 'express';
import multer from 'multer';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import { GoodsService } from '../services/goods.service';
import { processGoodsPreviewImage } from '../services/shop/goodsPreviewImage';

const previewUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new ApiError(400, `Invalid file type: ${file.mimetype}`));
  },
});

export const goodsPreviewUpload = previewUpload.single('preview');

export const createGoods = asyncHandler(async (req: AuthRequest, res: Response) => {
  const goods = await GoodsService.createGoods(req.body);
  res.status(201).json({ success: true, data: goods });
});

export const getAllGoods = asyncHandler(async (req: AuthRequest, res: Response) => {
  const goods = await GoodsService.getAllGoods({ kind: req.query.kind });
  res.json({ success: true, data: goods });
});

export const getGoodsById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const goods = await GoodsService.getGoodsById(req.params.id);
  res.json({ success: true, data: goods });
});

export const updateGoods = asyncHandler(async (req: AuthRequest, res: Response) => {
  const goods = await GoodsService.updateGoods(req.params.id, req.body);
  res.json({ success: true, data: goods });
});

export const deleteGoods = asyncHandler(async (req: AuthRequest, res: Response) => {
  await GoodsService.deleteGoods(req.params.id);
  res.json({ success: true, message: 'Goods deleted successfully' });
});

export const getWithdrawSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const summary = await GoodsService.getWithdrawSummary(req.params.id);
  res.json({ success: true, data: summary });
});

export const withdrawGoods = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await GoodsService.withdrawGoods(req.params.id);
  res.json({ success: true, data: result });
});

export const uploadGoodsPreview = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'A preview image file is required');
  }
  const previewUrl = await processGoodsPreviewImage(req.file.buffer, req.params.id);
  const goods = await GoodsService.updateGoods(req.params.id, { previewUrl });
  res.json({ success: true, data: goods });
});
