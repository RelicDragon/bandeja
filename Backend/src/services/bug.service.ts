import prisma from '../config/database';
import { BugStatus, BugType } from '@prisma/client';
import { USER_SELECT_FIELDS } from '../utils/constants';

export class BugService {
  static async createBug(text: string, bugType: BugType, senderId: string) {
    return await prisma.bug.create({
      data: {
        text: text.trim(),
        bugType,
        senderId,
      },
      include: {
        sender: {
          select: {
            ...USER_SELECT_FIELDS,
            isAdmin: true,
          },
        },
      },
    });
  }

  static async getBugs(filters: {
    status?: BugStatus;
    bugType?: BugType;
    senderId?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, bugType, senderId, page = 1, limit = 10 } = filters;

    const where: any = {};

    if (status) {
      where.status = status;
    } else {
      where.status = { not: 'ARCHIVED' };
    }

    if (bugType) {
      where.bugType = bugType;
    }

    if (senderId) {
      where.senderId = senderId;
    }

    const [bugs, total] = await Promise.all([
      prisma.bug.findMany({
        where,
        include: {
          sender: {
            select: {
              ...USER_SELECT_FIELDS,
              isAdmin: true,
            },
          },
          participants: {
            include: {
              user: {
                select: USER_SELECT_FIELDS,
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.bug.count({ where }),
    ]);

    return {
      bugs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  static async updateBugStatus(id: string, status: BugStatus) {
    return await prisma.bug.update({
      where: { id },
      data: { status },
      include: {
        sender: {
          select: {
            ...USER_SELECT_FIELDS,
            isAdmin: true,
          },
        },
      },
    });
  }

  static async updateBug(id: string, data: { status?: BugStatus; bugType?: BugType }) {
    return await prisma.bug.update({
      where: { id },
      data,
      include: {
        sender: {
          select: {
            ...USER_SELECT_FIELDS,
            isAdmin: true,
          },
        },
      },
    });
  }

  static async deleteBug(id: string) {
    await prisma.bug.delete({
      where: { id },
    });
  }

  static async getBugById(id: string) {
    return await prisma.bug.findUnique({
      where: { id },
      include: {
        sender: {
          select: {
            ...USER_SELECT_FIELDS,
            isAdmin: true,
          },
        },
        participants: {
          include: {
            user: {
              select: USER_SELECT_FIELDS,
            },
          },
        },
      },
    });
  }
}
