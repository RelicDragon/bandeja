import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { MessageReportReason } from '@prisma/client';

export class MessageReportService {
  static async reportMessage(messageId: string, reporterId: string, reason: MessageReportReason, description?: string) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    const existingReport = await prisma.messageReport.findUnique({
      where: {
        messageId_reporterId: {
          messageId,
          reporterId
        }
      }
    });

    if (existingReport) {
      throw new ApiError(400, 'You have already reported this message');
    }

    const report = await prisma.messageReport.create({
      data: {
        messageId,
        reporterId,
        reason,
        description: description?.trim() || null,
        status: 'PENDING'
      },
      include: {
        message: {
          select: {
            id: true,
            content: true
          }
        },
        reporter: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    return report;
  }
}

