import { ChatSyncEventType, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { ChatSyncEventService } from './chatSyncEvent.service';

export class PollService {
    /**
     * Vote via ID (Atomic transaction)
     */
    static async vote(pollId: string, userId: string, optionIds: string[]) {
        return await prisma.$transaction(async (tx) => {
            const poll = await tx.poll.findUnique({
                where: { id: pollId },
                include: { options: true }
            });

            if (!poll) {
                throw new ApiError(404, 'Poll not found');
            }

            const hostMessage = await tx.chatMessage.findUnique({
                where: { id: poll.messageId },
                select: { deletedAt: true },
            });
            if (!hostMessage || hostMessage.deletedAt) {
                throw new ApiError(404, 'Poll not found');
            }

            // Check if user has already voted on a quiz (quizzes don't allow vote changes)
            if (poll.type === 'QUIZ') {
                const existingVotes = await tx.pollVote.findMany({
                    where: {
                        pollId,
                        userId
                    }
                });
                if (existingVotes.length > 0) {
                    throw new ApiError(400, 'Cannot change vote on a quiz');
                }
            }

            // Validate options belong to poll (only if optionIds is not empty)
            if (optionIds.length > 0) {
                const validOptionIds = poll.options.map(o => o.id);
                const allValid = optionIds.every(id => validOptionIds.includes(id));
                if (!allValid) {
                    throw new ApiError(400, 'Invalid option IDs for this poll');
                }

                // Check single choice
                if (!poll.allowsMultipleAnswers && optionIds.length > 1) {
                    throw new ApiError(400, 'This poll only allows a single answer');
                }
            }

            // Remove existing votes for this user in this poll
            await tx.pollVote.deleteMany({
                where: {
                    pollId,
                    userId
                }
            });

            // Add new votes (only if optionIds is not empty)
            if (optionIds.length > 0) {
                await tx.pollVote.createMany({
                    data: optionIds.map(optionId => ({
                        pollId,
                        optionId,
                        userId
                    }))
                });
            }

            const updatedPoll = await tx.poll.findUnique({
                where: { id: pollId },
                include: {
                    options: {
                        include: {
                            votes: {
                                include: {
                                    user: { select: USER_SELECT_FIELDS }
                                }
                            }
                        },
                        orderBy: {
                            order: Prisma.SortOrder.asc
                        }
                    },
                    votes: {
                        include: {
                            user: { select: USER_SELECT_FIELDS }
                        }
                    }
                }
            });

            const ctxMsg = await tx.chatMessage.findUnique({
                where: { id: poll.messageId },
                select: { chatContextType: true, contextId: true },
            });
            let syncSeq: number | undefined;
            if (ctxMsg && updatedPoll) {
                const sanitized = updatedPoll.isAnonymous
                    ? {
                        ...updatedPoll,
                        options: updatedPoll.options.map((o) => ({
                            ...o,
                            votes: o.votes.map((v) => ({ ...v, user: undefined })),
                        })),
                        votes: updatedPoll.votes.map((v) => ({ ...v, user: undefined })),
                    }
                    : updatedPoll;
                syncSeq = await ChatSyncEventService.appendEventInTransaction(
                    tx,
                    ctxMsg.chatContextType,
                    ctxMsg.contextId,
                    ChatSyncEventType.POLL_VOTED,
                    {
                        pollId: updatedPoll.id,
                        messageId: updatedPoll.messageId,
                        updatedPoll: sanitized,
                    }
                );
            }

            return { poll: updatedPoll, syncSeq };
        });
    }
}
