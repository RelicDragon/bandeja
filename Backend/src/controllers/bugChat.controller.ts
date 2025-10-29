import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import { ChatType } from '@prisma/client';
import { SystemMessageType } from '../utils/systemMessages';
import { BugMessageService } from '../services/bug/bugMessage.service';
import { BugReactionService } from '../services/bug/bugReaction.service';
import { BugReadReceiptService } from '../services/bug/bugReadReceipt.service';
import { BugSystemMessageService } from '../services/bug/bugSystemMessage.service';
import prisma from '../config/database';

export const createBugSystemMessage = async (bugId: string, messageData: { type: SystemMessageType; variables: Record<string, string> }, chatType: ChatType = ChatType.PUBLIC) => {
  const message = await BugSystemMessageService.createSystemMessage(bugId, messageData, chatType);

  const socketService = (global as any).socketService;
  if (socketService) {
    socketService.emitNewBugMessage(bugId, message);
  }

  return message;
};

export const createBugMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { bugId, content, mediaUrls = [], replyToId, chatType = ChatType.PUBLIC } = req.body;
  const senderId = req.userId;

  if (!senderId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const message = await BugMessageService.createMessage({
    bugId,
    senderId,
    content,
    mediaUrls,
    replyToId,
    chatType
  });

  const socketService = (global as any).socketService;
  if (socketService) {
    socketService.emitNewBugMessage(bugId, message);
  }

  res.status(201).json({
    success: true,
    data: message
  });
});

export const getBugMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { bugId } = req.params;
  const userId = req.userId;
  const { page = 1, limit = 50, chatType = ChatType.PUBLIC } = req.query;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const messages = await BugMessageService.getMessages(bugId, userId, {
    page: Number(page),
    limit: Number(limit),
    chatType: chatType as ChatType
  });

  res.json({
    success: true,
    data: messages
  });
});

export const updateBugMessageState = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { messageId } = req.params;
  const { state } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const updatedMessage = await BugMessageService.updateMessageState(messageId, userId, state);

  res.json({
    success: true,
    data: updatedMessage
  });
});

export const markBugMessageAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { messageId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const readReceipt = await BugReadReceiptService.markMessageAsRead(messageId, userId);

  const socketService = (global as any).socketService;
  if (socketService) {
    // Get the bugId from the message to emit to the correct room
    const message = await prisma.bugMessage.findUnique({
      where: { id: messageId },
      select: { bugId: true }
    });

    if (message) {
      socketService.emitBugReadReceipt(message.bugId, readReceipt);
    }
  }

  res.json({ success: true });
});

export const addBugReaction = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { messageId } = req.params;
  const { emoji } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const reaction = await BugReactionService.addReaction(messageId, userId, emoji);

  const socketService = (global as any).socketService;
  if (socketService && reaction) {
    // Get the bugId from the message to emit to the correct room
    const message = await prisma.bugMessage.findUnique({
      where: { id: messageId },
      select: { bugId: true }
    });

    if (message) {
      socketService.emitBugMessageReaction(message.bugId, reaction);
    }
  }

  res.json({
    success: true,
    data: reaction
  });
});

export const removeBugReaction = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { messageId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const result = await BugReactionService.removeReaction(messageId, userId);

  const socketService = (global as any).socketService;
  if (socketService) {
    // Get the bugId from the message to emit to the correct room
    const message = await prisma.bugMessage.findUnique({
      where: { id: messageId },
      select: { bugId: true }
    });

    if (message) {
      socketService.emitBugMessageReaction(message.bugId, result);
    }
  }

  res.json({ success: true });
});

export const getUserBugChats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const bugs = await BugMessageService.getUserBugChats(userId);

  res.json({
    success: true,
    data: bugs
  });
});

export const getBugUnreadCount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const result = await BugReadReceiptService.getUnreadCount(userId);

  res.json({
    success: true,
    data: result
  });
});

export const getBugChatUnreadCount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { bugId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const result = await BugReadReceiptService.getBugUnreadCount(bugId, userId);

  res.json({
    success: true,
    data: result
  });
});

export const getBugsUnreadCounts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { bugIds } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!bugIds || !Array.isArray(bugIds) || bugIds.length === 0) {
    throw new ApiError(400, 'Bug IDs array is required');
  }

  const result = await BugReadReceiptService.getBugsUnreadCounts(bugIds, userId);

  res.json({
    success: true,
    data: result
  });
});

export const deleteBugMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { messageId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const message = await BugMessageService.deleteMessage(messageId, userId);

  const socketService = (global as any).socketService;
  if (socketService) {
    socketService.emitBugMessageDeleted(message.bugId, messageId);
  }

  res.json({ success: true });
});
