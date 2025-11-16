import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { SystemMessageType, getUserDisplayName } from '../../utils/systemMessages';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { createBugSystemMessage } from '../../controllers/chat.controller';

export class BugParticipantService {
  static async joinBugChat(bugId: string, userId: string) {
    const bug = await prisma.bug.findUnique({
      where: { id: bugId },
      include: {
        sender: true
      }
    });

    if (!bug) {
      throw new ApiError(404, 'Bug not found');
    }

    const existingParticipant = await prisma.bugParticipant.findUnique({
      where: {
        bugId_userId: {
          bugId,
          userId
        }
      }
    });

    if (existingParticipant) {
      throw new ApiError(400, 'Already joined this bug chat');
    }

    await prisma.bugParticipant.create({
      data: {
        bugId,
        userId,
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT_FIELDS,
    });

    if (user) {
      const userName = getUserDisplayName(user.firstName, user.lastName);
      await createBugSystemMessage(
        bugId,
        {
          type: SystemMessageType.USER_JOINED_CHAT,
          variables: { userName }
        }
      );
    }

    return 'Successfully joined the bug chat';
  }

  static async leaveBugChat(bugId: string, userId: string) {
    const bug = await prisma.bug.findUnique({
      where: { id: bugId }
    });

    if (!bug) {
      throw new ApiError(404, 'Bug not found');
    }

    if (bug.senderId === userId) {
      throw new ApiError(400, 'Bug creator cannot leave the chat');
    }

    const participant = await prisma.bugParticipant.findUnique({
      where: {
        bugId_userId: {
          bugId,
          userId
        }
      }
    });

    if (!participant) {
      throw new ApiError(404, 'Not a participant in this bug chat');
    }

    await prisma.bugParticipant.delete({
      where: {
        bugId_userId: {
          bugId,
          userId
        }
      }
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT_FIELDS,
    });

    if (user) {
      const userName = getUserDisplayName(user.firstName, user.lastName);
      await createBugSystemMessage(
        bugId,
        {
          type: SystemMessageType.USER_LEFT_CHAT,
          variables: { userName }
        }
      );
    }

    return 'Successfully left the bug chat';
  }

  static async isParticipant(bugId: string, userId: string): Promise<boolean> {
    const bug = await prisma.bug.findUnique({
      where: { id: bugId }
    });

    if (!bug) {
      return false;
    }

    if (bug.senderId === userId) {
      return true;
    }

    const participant = await prisma.bugParticipant.findUnique({
      where: {
        bugId_userId: {
          bugId,
          userId
        }
      }
    });

    return !!participant;
  }
}

