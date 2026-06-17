import prisma from '../../config/database';
import { ParticipantRole } from '@prisma/client';
import { projectGroupChannelEmbeddedUsers } from '../user/projectEmbeddedBasicUsers';

export type GcWithParticipants = Awaited<ReturnType<typeof prisma.groupChannel.findMany>>[number] & {
  participants: Array<{ userId: string; role: ParticipantRole }>;
  pinnedByUsers?: Array<{ pinnedAt: Date }>;
};

/** Strips denormalized last-message DB fields and adds API `lastMessage` object. */
export function withGroupChannelLastMessage(row: Record<string, unknown>) {
  const {
    lastMessagePreview,
    lastMessageSenderId,
    lastMessageSender,
    ...rest
  } = row as Record<string, unknown> & {
    lastMessagePreview?: string | null;
    lastMessageSenderId?: string | null;
    lastMessageSender?: object | null;
    updatedAt: Date;
  };
  const updatedAt = row.updatedAt as Date;
  return {
    ...rest,
    lastMessage: lastMessagePreview
      ? {
          preview: lastMessagePreview as string,
          updatedAt: updatedAt.toISOString(),
          senderId: (lastMessageSenderId as string | null | undefined) ?? null,
          sender: (lastMessageSender as object | null | undefined) ?? null,
        }
      : null,
  };
}

export function mapGroupChannelToResponse(gc: GcWithParticipants, userId: string, isMuted: boolean) {
  const userParticipant = gc.participants.find((p) => p.userId === userId);
  const isOwner = userParticipant?.role === ParticipantRole.OWNER;
  const isParticipant = !!userParticipant;
  const pinned = gc.pinnedByUsers && gc.pinnedByUsers.length > 0 ? gc.pinnedByUsers[0] : null;
  const base = withGroupChannelLastMessage(gc as unknown as Record<string, unknown>);
  return projectGroupChannelEmbeddedUsers({
    ...base,
    isParticipant,
    isOwner,
    isPinned: !!pinned,
    pinnedAt: pinned?.pinnedAt?.toISOString() ?? null,
    isMuted,
  } as Record<string, unknown>);
}

export type MappedGroupChannel = ReturnType<typeof mapGroupChannelToResponse>;
