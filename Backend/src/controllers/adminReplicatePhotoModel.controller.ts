import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { ReplicatePhotoModelSettingService } from '../services/replicate/replicatePhotoModelSetting.service';

export const getReplicatePhotoModel = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const activeModelId = await ReplicatePhotoModelSettingService.getActiveModelId();
    res.json({
      success: true,
      data: {
        activeModelId,
        models: ReplicatePhotoModelSettingService.listModels(),
        envFallbackModelId: ReplicatePhotoModelSettingService.envFallbackModelId(),
      },
    });
  }
);

export const setReplicatePhotoModel = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { modelId } = req.body as { modelId?: string };
    if (!modelId?.trim()) {
      res.status(400).json({ success: false, error: 'modelId is required' });
      return;
    }
    try {
      const activeModelId = await ReplicatePhotoModelSettingService.setActiveModelId(
        modelId.trim()
      );
      res.json({
        success: true,
        data: {
          activeModelId,
          models: ReplicatePhotoModelSettingService.listModels(),
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: msg });
    }
  }
);
