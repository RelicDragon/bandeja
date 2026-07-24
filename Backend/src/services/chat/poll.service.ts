import { ChatSyncEventType } from '@bandeja/chat-contract';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_WITH_SPORT_PROFILES } from '../../utils/constants';
import { ChatSyncEventService } from './chatSyncEvent.service';
import { MessageService } from './message.service';
import { findLiveForwardsOfMessage } from './forwardMessage.service';
import {
  projectUserForSportContext,
  resolveChatMessageSport,
} from '../user/userSportProfile.service';

type PollUser = Parameters<typeof projectUserForSportContext>[0];

function projectPollUsers<
  T extends {
    options: Array<{ votes: Array<{ user?: PollUser | null }> }>;
    votes: Array<{ user?: PollUser | null }>;
  },
>(poll: T, sport: Parameters<typeof projectUserForSportContext>[1]): T {
  const project = (u: PollUser | null | undefined) =>
    u ? projectUserForSportContext(u, sport) : u;
  return {
    ...poll,
    options: poll.options.map((o) => ({
      ...o,
      votes: o.votes.map((v) => ({ ...v, user: project(v.user) })),
    })),
    votes: poll.votes.map((v) => ({ ...v, user: project(v.user) })),
  };
}

async function assertCanVoteOnPollHost(
  host: {
    chatContextType: import('@prisma/client').ChatContextType;
    contextId: string;
    chatType: import('@prisma/client').ChatType;
  },
  hostMessageId: string,
  userId: string
): Promise<void> {
  try {
    await MessageService.validateMessageAccess(
      {
        chatContextType: host.chatContextType,
        contextId: host.contextId,
        chatType: host.chatType,
      },
      userId,
      true
    );
    return;
  } catch (e) {
    if (!(e instanceof ApiError) || (e.statusCode !== 403 && e.statusCode !== 404)) {
      throw e;
    }
  }

  // Linked forwards: vote from a chat that received the shared poll.
  const forwards = await findLiveForwardsOfMessage(hostMessageId);
  for (const fwd of forwards) {
    try {
      await MessageService.validateMessageAccess(
        {
          chatContextType: fwd.chatContextType,
          contextId: fwd.contextId,
          chatType: fwd.chatType,
        },
        userId,
        true
      );
      return;
    } catch (e) {
      if (!(e instanceof ApiError) || (e.statusCode !== 403 && e.statusCode !== 404)) {
        throw e;
      }
    }
  }

  throw new ApiError(403, 'You do not have access to this poll', true, {
    code: 'chat.poll.forbidden',
  });
}

export type PollVoteFanoutTarget = {
  messageId: string;
  chatContextType: import('@prisma/client').ChatContextType;
  contextId: string;
  chatType: import('@prisma/client').ChatType;
  syncSeq?: number;
};

function fanoutDedupeKey(t: PollVoteFanoutTarget): string {
  // GAME PUBLIC/PRIVATE/ADMINS are separate live rooms — must not collapse.
  if (t.chatContextType === 'GAME') {
    return `${t.chatContextType}:${t.contextId}:${t.chatType}`;
  }
  return `${t.chatContextType}:${t.contextId}`;
}

export class PollService {
  /**
   * Vote via ID (Atomic transaction). Votes always hit the host poll;
   * linked forwards share the same Poll row via hydration.
   */
  static async vote(pollId: string, userId: string, optionIds: string[]) {
    const result = await prisma.$transaction(async (tx) => {
      const poll = await tx.poll.findUnique({
        where: { id: pollId },
        include: { options: true },
      });

      if (!poll) {
        throw new ApiError(404, 'Poll not found');
      }

      const hostMessage = await tx.chatMessage.findUnique({
        where: { id: poll.messageId },
        select: {
          deletedAt: true,
          chatContextType: true,
          contextId: true,
          chatType: true,
        },
      });
      if (!hostMessage) {
        throw new ApiError(404, 'Poll not found');
      }

      // Soft-deleted host: still allow votes from live linked forwards.
      if (hostMessage.deletedAt) {
        const liveForwards = await findLiveForwardsOfMessage(poll.messageId);
        if (liveForwards.length === 0) {
          throw new ApiError(404, 'Poll not found');
        }
        let allowed = false;
        for (const fwd of liveForwards) {
          try {
            await MessageService.validateMessageAccess(
              {
                chatContextType: fwd.chatContextType,
                contextId: fwd.contextId,
                chatType: fwd.chatType,
              },
              userId,
              true
            );
            allowed = true;
            break;
          } catch (e) {
            if (!(e instanceof ApiError) || (e.statusCode !== 403 && e.statusCode !== 404)) {
              throw e;
            }
          }
        }
        if (!allowed) {
          throw new ApiError(403, 'You do not have access to this poll', true, {
            code: 'chat.poll.forbidden',
          });
        }
      } else {
        await assertCanVoteOnPollHost(hostMessage, poll.messageId, userId);
      }

      if (poll.type === 'QUIZ') {
        const existingVotes = await tx.pollVote.findMany({
          where: { pollId, userId },
        });
        if (existingVotes.length > 0) {
          throw new ApiError(400, 'Cannot change vote on a quiz');
        }
      }

      if (optionIds.length > 0) {
        const validOptionIds = poll.options.map((o) => o.id);
        const allValid = optionIds.every((id) => validOptionIds.includes(id));
        if (!allValid) {
          throw new ApiError(400, 'Invalid option IDs for this poll');
        }
        if (!poll.allowsMultipleAnswers && optionIds.length > 1) {
          throw new ApiError(400, 'This poll only allows a single answer');
        }
      }

      await tx.pollVote.deleteMany({ where: { pollId, userId } });

      if (optionIds.length > 0) {
        await tx.pollVote.createMany({
          data: optionIds.map((optionId) => ({
            pollId,
            optionId,
            userId,
          })),
        });
      }

      const updatedPoll = await tx.poll.findUnique({
        where: { id: pollId },
        include: {
          options: {
            include: {
              votes: {
                include: {
                  user: { select: USER_SELECT_WITH_SPORT_PROFILES },
                },
              },
            },
            orderBy: {
              order: Prisma.SortOrder.asc,
            },
          },
          votes: {
            include: {
              user: { select: USER_SELECT_WITH_SPORT_PROFILES },
            },
          },
        },
      });

      const forwards = await tx.chatMessage.findMany({
        where: {
          forwardedFromMessageId: poll.messageId,
          deletedAt: null,
        },
        select: {
          id: true,
          chatContextType: true,
          contextId: true,
          chatType: true,
        },
      });

      const fanoutTargets: PollVoteFanoutTarget[] = [
        ...(hostMessage.deletedAt
          ? []
          : [
              {
                messageId: poll.messageId,
                chatContextType: hostMessage.chatContextType,
                contextId: hostMessage.contextId,
                chatType: hostMessage.chatType,
              },
            ]),
        ...forwards.map((f) => ({
          messageId: f.id,
          chatContextType: f.chatContextType,
          contextId: f.contextId,
          chatType: f.chatType,
        })),
      ];

      const seenCtx = new Set<string>();
      const uniqueCtxTargets: PollVoteFanoutTarget[] = [];
      for (const t of fanoutTargets) {
        const key = fanoutDedupeKey(t);
        if (seenCtx.has(key)) continue;
        seenCtx.add(key);
        uniqueCtxTargets.push(t);
      }

      let projectedPoll = updatedPoll;
      if (updatedPoll) {
        const sport = await resolveChatMessageSport(
          {
            chatContextType: hostMessage.chatContextType,
            contextId: hostMessage.contextId,
          },
          userId
        );
        projectedPoll = projectPollUsers(updatedPoll, sport);
        const sanitized = projectedPoll.isAnonymous
          ? {
              ...projectedPoll,
              options: projectedPoll.options.map((o) => ({
                ...o,
                votes: o.votes.map((v) => ({ ...v, user: undefined })),
              })),
              votes: projectedPoll.votes.map((v) => ({ ...v, user: undefined })),
            }
          : projectedPoll;

        for (const target of uniqueCtxTargets) {
          const syncSeq = await ChatSyncEventService.appendEventInTransaction(
            tx,
            target.chatContextType,
            target.contextId,
            ChatSyncEventType.POLL_VOTED,
            {
              pollId: projectedPoll.id,
              messageId: poll.messageId,
              relatedMessageIds: fanoutTargets.map((f) => f.messageId),
              updatedPoll: sanitized,
            }
          );
          target.syncSeq = syncSeq;
        }
      }

      return {
        poll: projectedPoll,
        hostMessageId: poll.messageId,
        fanoutTargets,
        uniqueCtxTargets,
      };
    });

    return result;
  }
}
