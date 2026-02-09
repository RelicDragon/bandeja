import prisma from '../config/database';
import { BugStatus, BugType, ParticipantRole, Prisma } from '@prisma/client';
import { USER_SELECT_FIELDS } from '../utils/constants';

const BUG_TYPE_ORDER = Prisma.sql`CASE "bugType" WHEN 'CRITICAL' THEN 0 WHEN 'BUG' THEN 1 ELSE 2 END`;
const BUG_STATUS_ORDER = Prisma.sql`CASE status WHEN 'CREATED' THEN 0 WHEN 'CONFIRMED' THEN 1 WHEN 'IN_PROGRESS' THEN 2 WHEN 'TEST' THEN 3 WHEN 'FINISHED' THEN 4 WHEN 'ARCHIVED' THEN 5 END`;

export class BugService {
  static async createBug(text: string, bugType: BugType, senderId: string) {
    const trimmed = text.trim();
    const groupName = trimmed.length > 100 ? trimmed.substring(0, 97) + '...' : trimmed;

    const owner = await prisma.user.findUnique({
      where: { id: senderId },
      select: { currentCityId: true }
    });

    const developers = await prisma.user.findMany({
      where: { isDeveloper: true, id: { not: senderId } },
      select: { id: true }
    });

    return await prisma.$transaction(async (tx) => {
      const bug = await tx.bug.create({
        data: { text: trimmed, bugType, senderId },
        include: {
          sender: { select: { ...USER_SELECT_FIELDS, isAdmin: true } }
        }
      });

      const groupChannel = await tx.groupChannel.create({
        data: {
          name: groupName,
          isChannel: false,
          isPublic: true,
          bugId: bug.id,
          cityId: owner?.currentCityId ?? null,
          participantsCount: 1 + developers.length
        }
      });

      await tx.groupChannelParticipant.create({
        data: {
          groupChannelId: groupChannel.id,
          userId: senderId,
          role: ParticipantRole.OWNER
        }
      });

      for (const dev of developers) {
        await tx.bugParticipant.create({
          data: { bugId: bug.id, userId: dev.id }
        });
        await tx.groupChannelParticipant.create({
          data: {
            groupChannelId: groupChannel.id,
            userId: dev.id,
            role: ParticipantRole.PARTICIPANT
          }
        });
      }

      return { ...bug, groupChannel };
    });
  }

  static async getBugs(filters: {
    status?: BugStatus;
    bugType?: BugType;
    senderId?: string;
    page?: number;
    limit?: number;
    all?: boolean;
  }) {
    const { status, bugType, senderId, page = 1, limit = 10, all = false } = filters;

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

    const total = await prisma.bug.count({ where });

    const whereConditions: Prisma.Sql[] = [];
    if (status) {
      whereConditions.push(Prisma.sql`status = ${status}`);
    } else {
      whereConditions.push(Prisma.sql`status != 'ARCHIVED'`);
    }
    if (bugType) whereConditions.push(Prisma.sql`"bugType" = ${bugType}`);
    if (senderId) whereConditions.push(Prisma.sql`"senderId" = ${senderId}`);
    const whereSql = Prisma.join(whereConditions, ' AND ');

    const idsResult = all
      ? await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT id FROM "Bug" WHERE ${whereSql}
          ORDER BY ${BUG_TYPE_ORDER}, ${BUG_STATUS_ORDER}
        `)
      : await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT id FROM "Bug" WHERE ${whereSql}
          ORDER BY ${BUG_TYPE_ORDER}, ${BUG_STATUS_ORDER}
          LIMIT ${limit} OFFSET ${(page - 1) * limit}
        `);

    const orderedIds = idsResult.map((r) => r.id);
    if (orderedIds.length === 0) {
      return {
        bugs: [],
        pagination: {
          page: all ? 1 : page,
          limit: all ? total : limit,
          total,
          pages: all ? 1 : Math.ceil(total / limit),
        },
      };
    }

    const bugsUnsorted = await prisma.bug.findMany({
      where: { id: { in: orderedIds } },
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
    const idToIndex = new Map(orderedIds.map((id, i) => [id, i]));
    const bugs = bugsUnsorted.sort((a, b) => (idToIndex.get(a.id) ?? 0) - (idToIndex.get(b.id) ?? 0));

    return {
      bugs,
      pagination: {
        page: all ? 1 : page,
        limit: all ? total : limit,
        total,
        pages: all ? 1 : Math.ceil(total / limit),
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
        groupChannel: {
          select: { id: true },
        },
      },
    });
  }
}
