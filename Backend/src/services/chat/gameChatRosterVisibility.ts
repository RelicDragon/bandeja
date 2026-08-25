import { Prisma } from '@prisma/client';
import {
  isInviteOnlyChatViewerStatus,
  isRosterLifecycleSystemMessageContent,
  isRosterLifecycleSystemMessagePayload,
  isRosterLifecycleSystemPreview,
  ROSTER_LIFECYCLE_SYSTEM_MESSAGE_TYPES,
  shouldHideRosterLifecycleSystemMessage,
  type RosterLifecycleSystemMessageType,
} from '../../shared/systemMessages/rosterLifecycle';

export {
  isInviteOnlyChatViewerStatus,
  isRosterLifecycleSystemMessageContent,
  isRosterLifecycleSystemMessagePayload,
  isRosterLifecycleSystemPreview,
  shouldHideRosterLifecycleSystemMessage,
};

export function prismaWhereNotRosterLifecycleSystemMessage(): Prisma.ChatMessageWhereInput {
  return {
    NOT: {
      AND: [
        { senderId: null },
        {
          OR: ROSTER_LIFECYCLE_SYSTEM_MESSAGE_TYPES.map((type: RosterLifecycleSystemMessageType) => ({
            content: { contains: `"type":"${type}"` },
          })),
        },
      ],
    },
  };
}

export function withInviteOnlyRosterMessageFilter(
  where: Prisma.ChatMessageWhereInput,
  participantStatus: string | undefined
): Prisma.ChatMessageWhereInput {
  if (!isInviteOnlyChatViewerStatus(participantStatus)) return where;
  return { AND: [where, prismaWhereNotRosterLifecycleSystemMessage()] };
}
