import { ParticipantRole, ChatContextType, ChatType, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { MessageService } from './message.service';
import { GroupChannelService } from './groupChannel.service';
import {
  discussionGroupCandidateWhere,
  participantIdsMatch,
} from './groupChannelExactMembers.where';

async function findExactGroupId(
  tx: Prisma.TransactionClient,
  ownerId: string,
  memberIds: string[],
): Promise<string | null> {
  const candidates = await tx.groupChannel.findMany({
    where: discussionGroupCandidateWhere(ownerId, memberIds.length),
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      participants: { select: { userId: true } },
    },
  });
  const match = candidates.find((row) =>
    participantIdsMatch(
      memberIds,
      row.participants.map((participant) => participant.userId),
    ),
  );
  return match?.id ?? null;
}

export async function findOrCreateExactMemberGroup(input: {
  ownerId: string;
  memberIds: string[];
  name: string;
}) {
  const unique = [...new Set(input.memberIds)].sort();
  if (!unique.includes(input.ownerId)) {
    throw new ApiError(400, 'Owner must be a member');
  }
  if (unique.length < 3) {
      throw new ApiError(400, 'playIntent.discussNeedGroup', true, {
        code: 'playIntent.discussNeedGroup',
      });
  }

  const fingerprint = `exact-group:${unique.join(',')}`;
  const trimmedName = input.name.trim().slice(0, 100);
  if (!trimmedName) {
    throw new ApiError(400, 'Name is required');
  }

  const { groupId, created } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${fingerprint}))`;
    const existingId = await findExactGroupId(tx, input.ownerId, unique);
    if (existingId) {
      await tx.groupChannelParticipant.updateMany({
        where: {
          groupChannelId: existingId,
          userId: { in: unique },
          hidden: true,
        },
        data: { hidden: false },
      });
      return { groupId: existingId, created: false };
    }

    const createdGroup = await tx.groupChannel.create({
      data: {
        name: trimmedName,
        isChannel: false,
        isPublic: false,
        participantsCount: unique.length,
        participants: {
          create: unique.map((userId) => ({
            userId,
            role:
              userId === input.ownerId
                ? ParticipantRole.OWNER
                : ParticipantRole.PARTICIPANT,
          })),
        },
      },
      select: { id: true },
    });
    return { groupId: createdGroup.id, created: true };
  });

  if (created) {
    try {
      await MessageService.createMessage({
        chatContextType: ChatContextType.GROUP,
        contextId: groupId,
        senderId: input.ownerId,
        content: 'Group created',
        mediaUrls: [],
        chatType: ChatType.PUBLIC,
      });
    } catch (error) {
      console.error('Failed to send "Group created" message:', error);
    }
  }

  return GroupChannelService.getGroupChannelById(groupId, input.ownerId);
}
