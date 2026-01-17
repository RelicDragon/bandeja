import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { MessageReportStatus } from '@prisma/client';
import { USER_SELECT_FIELDS } from '../../utils/constants';

export class AdminMessageReportsService {
  static async getAllReports(status?: MessageReportStatus) {
    const reports = await prisma.messageReport.findMany({
      where: status ? { status } : undefined,
      include: {
        message: {
          include: {
            sender: {
              select: {
                ...USER_SELECT_FIELDS,
                phone: true
              }
            }
          }
        },
        reporter: {
          select: {
            ...USER_SELECT_FIELDS,
            phone: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return reports;
  }

  static async updateReportStatus(reportId: string, status: MessageReportStatus) {
    const report = await prisma.messageReport.findUnique({
      where: { id: reportId }
    });

    if (!report) {
      throw new ApiError(404, 'Report not found');
    }

    const updatedReport = await prisma.messageReport.update({
      where: { id: reportId },
      data: { status },
      include: {
        message: {
          include: {
            sender: {
              select: {
                ...USER_SELECT_FIELDS,
                phone: true
              }
            }
          }
        },
        reporter: {
          select: {
            ...USER_SELECT_FIELDS,
            phone: true
          }
        }
      }
    });

    return updatedReport;
  }
}

