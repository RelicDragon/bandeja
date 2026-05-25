import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { MessageReportStatus } from '@prisma/client';
import { USER_SELECT_FIELDS } from '../../utils/constants';

export class AdminStoryCommentReportsService {
  static async getAllReports(status?: MessageReportStatus) {
    return prisma.storyCommentReport.findMany({
      where: status ? { status } : undefined,
      include: {
        comment: {
          include: {
            author: {
              select: { ...USER_SELECT_FIELDS, phone: true },
            },
          },
        },
        reporter: {
          select: { ...USER_SELECT_FIELDS, phone: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async updateReportStatus(reportId: string, status: MessageReportStatus) {
    const report = await prisma.storyCommentReport.findUnique({ where: { id: reportId } });
    if (!report) {
      throw new ApiError(404, 'Report not found');
    }

    return prisma.storyCommentReport.update({
      where: { id: reportId },
      data: { status },
      include: {
        comment: {
          include: {
            author: {
              select: { ...USER_SELECT_FIELDS, phone: true },
            },
          },
        },
        reporter: {
          select: { ...USER_SELECT_FIELDS, phone: true },
        },
      },
    });
  }
}
