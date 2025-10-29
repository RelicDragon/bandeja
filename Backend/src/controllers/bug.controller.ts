import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import { BugService } from '../services/bug.service';
import { BugSystemMessageService } from '../services/bug/bugSystemMessage.service';
import { SystemMessageType } from '../utils/systemMessages';
import { BugStatus, BugType, ChatType } from '@prisma/client';

export const createBug = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { text, bugType } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new ApiError(400, 'Bug text is required');
  }

  if (!bugType || !Object.values(BugType).includes(bugType)) {
    throw new ApiError(400, 'Valid bug type is required');
  }

  const bug = await BugService.createBug(text, bugType, req.userId!);

  res.status(201).json({
    success: true,
    data: bug,
  });
});

export const getBugs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status, bugType, myBugsOnly, page = '1', limit = '10' } = req.query;

  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);

  if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
    throw new ApiError(400, 'Invalid pagination parameters');
  }

  const filters: any = {
    page: pageNum,
    limit: limitNum,
  };

  if (status && Object.values(BugStatus).includes(status as BugStatus)) {
    filters.status = status;
  }

  if (bugType && Object.values(BugType).includes(bugType as BugType)) {
    filters.bugType = bugType;
  }

  if (myBugsOnly === 'true') {
    filters.senderId = req.userId;
  }

  const result = await BugService.getBugs(filters);

  res.json({
    success: true,
    data: result,
  });
});

export const updateBug = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, bugType } = req.body;

  if ((!status || !Object.values(BugStatus).includes(status as BugStatus)) &&
      (!bugType || !Object.values(BugType).includes(bugType as BugType))) {
    throw new ApiError(400, 'Valid status or bugType is required');
  }

  const existingBug = await BugService.getBugById(id);

  if (!existingBug) {
    throw new ApiError(404, 'Bug not found');
  }

  const bug = await BugService.updateBug(id, { status, bugType });

  // Send system messages for status/type changes
  if (status && status !== existingBug.status) {
    await BugSystemMessageService.createSystemMessage(
      id,
      {
        type: SystemMessageType.BUG_STATUS_CHANGED,
        variables: { status: status.toLowerCase() }
      },
      ChatType.PUBLIC
    );
  }

  if (bugType && bugType !== existingBug.bugType) {
    await BugSystemMessageService.createSystemMessage(
      id,
      {
        type: SystemMessageType.BUG_TYPE_CHANGED,
        variables: { type: bugType.toLowerCase() }
      },
      ChatType.PUBLIC
    );
  }

  res.json({
    success: true,
    data: bug,
  });
});

export const deleteBug = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const existingBug = await BugService.getBugById(id);

  if (!existingBug) {
    throw new ApiError(404, 'Bug not found');
  }

  await BugService.deleteBug(id);

  res.json({
    success: true,
    message: 'Bug deleted successfully',
  });
});
