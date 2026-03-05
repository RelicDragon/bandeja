import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import { BugService } from '../services/bug.service';
import { BugParticipantService } from '../services/bug/participant.service';
import { SystemMessageType } from '../utils/systemMessages';
import { BugStatus, BugType, ChatType, ChatContextType } from '@prisma/client';
import { createSystemMessage } from './chat.controller';
import { MessageService } from '../services/chat/message.service';
import notificationService from '../services/notification.service';
import prisma from '../config/database';

const getSocketService = () => (global as any).socketService;

const clampPriority = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (Number.isNaN(n)) return 0;
  return Math.min(2, Math.max(-2, n));
};

export const createBug = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { text, bugType, priority: rawPriority } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new ApiError(400, 'errors.bugs.textRequired');
  }

  if (!bugType || !Object.values(BugType).includes(bugType)) {
    throw new ApiError(400, 'errors.bugs.typeRequired');
  }

  const priority = rawPriority !== undefined ? clampPriority(rawPriority) : 0;
  const { groupChannel, ...bug } = await BugService.createBug(text, bugType, req.userId!, priority);

  notificationService.sendNewBugNotification(bug, groupChannel.id, bug.sender).catch((err: unknown) =>
    console.error('Failed to send new bug notification:', err)
  );

  getSocketService()?.emitNewBug().catch((err: unknown) =>
    console.error('Failed to emit new bug to developers:', err)
  );

  await MessageService.createMessage({
    chatContextType: ChatContextType.GROUP,
    contextId: groupChannel.id,
    senderId: req.userId!,
    content: text.trim(),
    mediaUrls: [],
    chatType: ChatType.PUBLIC
  }).catch((err: unknown) => console.error('Failed to create bug description message:', err));

  res.status(201).json({
    success: true,
    data: { bug, groupChannel },
  });
});

export const getBugs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status, bugType, myBugsOnly, page = '1', limit = '10', all } = req.query;

  const filters: any = {};

  if (all === 'true') {
    filters.all = true;
  } else {
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    if (pageNum < 1 || limitNum < 1 || limitNum > 10) {
      throw new ApiError(400, 'errors.generic');
    }

    filters.page = pageNum;
    filters.limit = limitNum;
  }

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

const formatPriorityForMessage = (p: number): string => (p > 0 ? `+${p}` : String(p));

export const updateBug = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, bugType, priority: rawPriority } = req.body;

  const priority =
    rawPriority !== undefined && rawPriority !== null
      ? clampPriority(rawPriority)
      : undefined;
  const hasValidStatus = status && Object.values(BugStatus).includes(status as BugStatus);
  const hasValidType = bugType && Object.values(BugType).includes(bugType as BugType);
  const hasValidPriority = priority !== undefined;

  if (!hasValidStatus && !hasValidType && !hasValidPriority) {
    throw new ApiError(400, 'errors.bugs.statusOrTypeRequired');
  }

  const existingBug = await BugService.getBugById(id);

  if (!existingBug) {
    throw new ApiError(404, 'errors.bugs.notFound');
  }

  if (existingBug.senderId !== req.userId && !req.user?.isAdmin) {
    throw new ApiError(403, 'errors.bugs.updateForbidden');
  }

  const updateData: { status?: BugStatus; bugType?: BugType; priority?: number } = {};
  if (hasValidStatus) updateData.status = status;
  if (hasValidType) updateData.bugType = bugType;
  if (hasValidPriority) updateData.priority = priority;
  const bug = await BugService.updateBug(id, updateData);
  const groupChannel = await prisma.groupChannel.findUnique({
    where: { bugId: id },
    select: { id: true }
  });
  const contextId = groupChannel?.id ?? id;
  const chatContextType = groupChannel ? ChatContextType.GROUP : ChatContextType.BUG;

  if (status && status !== existingBug.status) {
    await createSystemMessage(
      contextId,
      {
        type: SystemMessageType.BUG_STATUS_CHANGED,
        variables: { status: status.toLowerCase() }
      },
      ChatType.PUBLIC,
      chatContextType
    );
  }

  if (bugType && bugType !== existingBug.bugType) {
    await createSystemMessage(
      contextId,
      {
        type: SystemMessageType.BUG_TYPE_CHANGED,
        variables: { type: bugType.toLowerCase() }
      },
      ChatType.PUBLIC,
      chatContextType
    );
  }

  if (hasValidPriority && priority !== existingBug.priority) {
    await createSystemMessage(
      contextId,
      {
        type: SystemMessageType.BUG_PRIORITY_CHANGED,
        variables: { priority: formatPriorityForMessage(priority) }
      },
      ChatType.PUBLIC,
      chatContextType
    );
  }

  res.json({
    success: true,
    data: bug,
  });
});

export const getBugById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const bug = await BugService.getBugById(id);

  if (!bug) {
    throw new ApiError(404, 'errors.bugs.notFound');
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
    throw new ApiError(404, 'errors.bugs.notFound');
  }

  await BugService.deleteBug(id);

  res.json({
    success: true,
    message: 'Bug deleted successfully',
  });
});

export const joinBugChat = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const message = await BugParticipantService.joinBugChat(id, req.userId!);

  res.json({
    success: true,
    message,
  });
});

export const leaveBugChat = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const message = await BugParticipantService.leaveBugChat(id, req.userId!);

  res.json({
    success: true,
    message,
  });
});
